-- =============================================
-- 0012 — la tarjeta como entidad: `workout_exercises`
--
-- Hallazgo que abrió esto (L42 del documento del MVP): **la tarjeta —el ejercicio dentro de una
-- sesión— no existía en la base**. Existía en el cliente (`WorkoutExerciseDraft`), viajaba en el
-- payload, y en la base sólo quedaban sus consecuencias: sus series en `workout_sets` **sin orden
-- ni posición**, y —sólo si alguien había cargado un objetivo— una `position` en
-- `workout_exercise_targets`. Tres cosas ya se estaban pagando:
--
--   1. **El orden de las tarjetas se perdía.** No se puede repetir un entrenamiento con fidelidad
--      si no se sabe en qué orden se hizo. `created_at` no salva el orden: es el timestamp de la
--      transacción y **todas** las series de un guardado lo comparten.
--   2. **El detalle y el CSV agrupaban por ejercicio**, y con el mismo ejercicio en dos tarjetas no
--      podían atribuirle una serie a ninguna de las dos (`L41`).
--   3. **Una tarjeta sin series y sin objetivo desaparecía del todo**: no había dónde estar.
--
-- Esta migración le da entidad a la tarjeta y **absorbe `workout_exercise_targets`**, que nunca fue
-- otra cosa: el objetivo es de la tarjeta, y esa tabla era la única que llevaba la posición.
--
-- ---
--
-- **La clave es `(workout_id, position)`**, y no `(workout_id, exercise_id, position)`. El mismo
-- ejercicio dos veces son **dos tarjetas**, y lo que las identifica es el lugar, no el ejercicio.
-- Es el criterio que O2 ya había escrito para el objetivo, y ahora es el de la tarjeta entera.
--
-- **`workout_sets` conserva `exercise_id` y suma `workout_exercise_id`.** Conservar la columna
-- denormalizada no es pereza: `exercise_progress` (Fase 1, con sus aserciones) **agrega por
-- `exercise_id` sobre `workout_sets`**, y quitársela obligaría a reescribir esa función y sus
-- tests, que hoy son el contrato del gráfico. Con las dos columnas hace falta una guarda de
-- consistencia —la serie no puede declarar un ejercicio distinto del de su tarjeta, ni pertenecer a
-- otra sesión— y va como **trigger**, integridad declarativa del motor, igual que `0004` puso el
-- dueño con un FK compuesto en vez de confiar en el cliente.
--
-- **El payload tiene dos formas, y la vieja se sigue aceptando.** No es cortesía: **una escritura
-- encolada offline antes de este deploy tiene el payload viejo**, y un RPC que sólo entendiera la
-- forma nueva la haría fallar para siempre en el primer reintento. La forma nueva manda las tarjetas
-- **en orden**, cada una con sus series adentro:
--
--   "exercises": [{ "exercise_id": uuid,
--                   "target_reps": int|null,          (opcionales e independientes, como en 0009)
--                   "target_weight_min": number|null,
--                   "target_weight_max": number|null,
--                   "sets": [ { "id": uuid, "set_number": int, "reps": int|null,
--                               "weight_kg": number|null, "rpe": number|null,
--                               "is_warmup": bool, "notes": text|null } ] }]
--
-- **La posición la escribe el RPC y sale del orden del array**, 1..N, numerada densa. El cliente no
-- manda `position` en la forma nueva y eso es deliberado: el orden del array **ya es** el orden de
-- las tarjetas —es `draft.exercises`—, así que pedirlo dos veces sólo agrega una forma de que las
-- dos digan cosas distintas. La forma vieja sí trae `exercise_targets[].position`, y ahí se usa para
-- **ordenar** (es la única señal de orden que esa forma tiene) y después se renumera.
--
-- **El backfill es reconstruido, no recuperado, y hay que decirlo.** Para las sesiones ya guardadas
-- se crea **una tarjeta por `(workout_id, exercise_id)`** —una, no dos: si el mismo ejercicio tenía
-- dos objetivos en dos tarjetas, las series no se pueden atribuir a ninguna de las dos, así que se
-- conserva el objetivo de menor posición, el mismo criterio que ya usaba el CSV— con `position`
-- tomada del objetivo cuando existe y, cuando no, un orden determinista (menor `set_number`,
-- desempate por `exercise_id`). Después se llenan los `workout_exercise_id` de las series por ese
-- par. **Ese orden no es el que el usuario hizo**: el dato original no está en la base y esta
-- migración no lo puede inventar.
--
-- **Lo que NO cambia**: `exercise_progress` (sigue leyendo `workout_sets` por `exercise_id`), el
-- cálculo del 1RM dentro de la misma transacción, la idempotencia (un reintento reemplaza las
-- tarjetas y sus series, como hoy reemplaza las series), el `REVOKE`/`GRANT` de `0003` (la firma de
-- `save_workout` no cambia) y `set_number` (que sigue siendo el ordinal dentro de su tarjeta, tal
-- como lo manda el cliente).
--
-- Sobre la seguridad: la tabla nueva la escribe `save_workout`, que es SECURITY DEFINER, y Postgres
-- **no aplica RLS al dueño de la tabla**. La policy de acá abajo protege la lectura y la escritura
-- directas; lo que impide escribir sobre un workout ajeno sigue siendo el check de ownership del
-- principio de la función, más el guard de dueño del ejercicio de `0011`, que ahora se aplica por
-- tarjeta.
-- =============================================

-- ---------- 1 · la tabla de la tarjeta ----------
CREATE TABLE public.workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  -- El lugar de la tarjeta en la sesión, contado desde uno. Un cero o un negativo no es un lugar.
  position INT NOT NULL CHECK (position > 0),
  target_reps INT,
  target_weight_min DECIMAL(6,2),
  target_weight_max DECIMAL(6,2),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- El lugar identifica a la tarjeta dentro de la sesión. Es la clave, y por eso es UNIQUE.
  CONSTRAINT workout_exercises_position_key UNIQUE (workout_id, position),

  -- La misma integridad de dueño que 0004 le puso a workout_sets, por el mismo motivo: que el
  -- `user_id` de la fila no pueda discrepar del dueño del workout, ni por un bug del cliente.
  CONSTRAINT workout_exercises_owner_fkey
    FOREIGN KEY (workout_id, user_id) REFERENCES public.workouts(id, user_id) ON DELETE CASCADE,

  -- Nada imposible, las mismas tres que traía el objetivo en 0009. `min < max` sigue sin validarse
  -- a propósito: se tipean de a uno y un rango a medio escribir es un estado real, no un error.
  CONSTRAINT workout_exercises_target_reps_check CHECK (target_reps IS NULL OR target_reps > 0),
  CONSTRAINT workout_exercises_target_weight_min_check
    CHECK (target_weight_min IS NULL OR target_weight_min >= 0),
  CONSTRAINT workout_exercises_target_weight_max_check
    CHECK (target_weight_max IS NULL OR target_weight_max >= 0)
);

ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workout exercises"
  ON public.workout_exercises FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- El GRANT explícito, por lo que documenta 0003: RLS filtra filas dentro de los privilegios que el
-- rol ya tiene, y sin GRANT todo falla con 42501 aunque la policy exista. Y el REVOKE explícito a
-- `anon`, por lo que documenta 0010: en el stack local una tabla nueva nace expuesta a `anon` por el
-- default de plataforma, así que la revocación tiene que estar escrita y no supuesta.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_exercises TO authenticated;
REVOKE ALL ON public.workout_exercises FROM anon;

-- ---------- 2 · la serie apunta a su tarjeta ----------
-- Nace nullable para poder llenarla con el backfill de abajo; el NOT NULL va después.
ALTER TABLE public.workout_sets ADD COLUMN workout_exercise_id UUID;

-- ---------- 3 · el backfill, antes del NOT NULL ----------
/*
 * Una tarjeta por (workout_id, exercise_id) sobre el universo de lo que ya existe: los ejercicios
 * nombrados por un objetivo y los que sólo aparecen en series. El desempate es determinista de
 * punta a punta para que la migración dé el mismo resultado si se corre dos veces.
 */
WITH pairs AS (
  SELECT workout_id, user_id, exercise_id FROM public.workout_exercise_targets
  UNION
  SELECT workout_id, user_id, exercise_id FROM public.workout_sets
),
target AS (
  -- El objetivo de MENOR posición cuando el mismo ejercicio tiene dos: sin identidad de tarjeta en
  -- el dato viejo, las series no se pueden atribuir a ninguna de las dos, y conservar uno es más
  -- honesto que fabricar dos tarjetas y dejar una vacía.
  SELECT DISTINCT ON (workout_id, exercise_id)
    workout_id, exercise_id, position,
    target_reps, target_weight_min, target_weight_max
  FROM public.workout_exercise_targets
  ORDER BY workout_id, exercise_id, position
),
info AS (
  SELECT
    p.workout_id,
    p.user_id,
    p.exercise_id,
    t.position AS target_position,
    t.target_reps,
    t.target_weight_min,
    t.target_weight_max,
    (SELECT MIN(s.set_number) FROM public.workout_sets s
      WHERE s.workout_id = p.workout_id AND s.exercise_id = p.exercise_id) AS min_set_number
  FROM pairs p
  LEFT JOIN target t
    ON t.workout_id = p.workout_id AND t.exercise_id = p.exercise_id
),
ordered AS (
  SELECT info.*,
    ROW_NUMBER() OVER (
      PARTITION BY workout_id
      ORDER BY target_position NULLS LAST, min_set_number NULLS LAST, exercise_id
    ) AS position
  FROM info
)
INSERT INTO public.workout_exercises (
  workout_id, user_id, exercise_id, position,
  target_reps, target_weight_min, target_weight_max
)
SELECT workout_id, user_id, exercise_id, position::INT,
       target_reps, target_weight_min, target_weight_max
FROM ordered;

UPDATE public.workout_sets s
SET workout_exercise_id = c.id
FROM public.workout_exercises c
WHERE c.workout_id = s.workout_id AND c.exercise_id = s.exercise_id;

-- Ahora sí: ninguna serie sin tarjeta, que es exactamente el estado que esta migración existe para
-- hacer imposible. Si el backfill dejó alguna afuera, la migración falla acá y no en producción.
ALTER TABLE public.workout_sets ALTER COLUMN workout_exercise_id SET NOT NULL;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_workout_exercise_fkey
  FOREIGN KEY (workout_exercise_id) REFERENCES public.workout_exercises(id) ON DELETE CASCADE;

-- ---------- 4 · la guarda de consistencia serie ↔ tarjeta ----------
/*
 * La FK sola dice que la tarjeta existe. No dice que sea **la** tarjeta de esta serie. Un bug del
 * cliente —o un INSERT directo— podría colgar una serie de Press Banca de la tarjeta de Sentadilla,
 * o de una tarjeta de otra sesión, y el detalle mostraría una serie donde no fue. Es la misma
 * familia de agujero que `0011`: lo que la FK no exige, lo tiene que exigir alguien.
 */
CREATE OR REPLACE FUNCTION public.check_workout_set_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_card public.workout_exercises;
BEGIN
  SELECT * INTO v_card FROM public.workout_exercises WHERE id = NEW.workout_exercise_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workout exercise not found';
  END IF;

  IF v_card.workout_id IS DISTINCT FROM NEW.workout_id
     OR v_card.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Set and workout exercise belong to different workouts';
  END IF;

  IF v_card.exercise_id IS DISTINCT FROM NEW.exercise_id THEN
    RAISE EXCEPTION 'Set exercise does not match its workout exercise';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workout_sets_card
  BEFORE INSERT OR UPDATE ON public.workout_sets
  FOR EACH ROW EXECUTE FUNCTION public.check_workout_set_card();

-- ---------- 5 · el objetivo ya vive en la tarjeta ----------
-- Después del backfill, no antes: sus filas ya están copiadas en `workout_exercises`.
DROP TABLE public.workout_exercise_targets;

-- ---------- 6 · `save_workout` escribe tarjetas ----------
CREATE OR REPLACE FUNCTION public.save_workout(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workout_id UUID;
  v_user_id UUID := (select auth.uid());
  v_owner UUID;
  v_cards jsonb;
  v_card jsonb;
  v_set jsonb;
  v_card_id UUID;
  v_card_position INT := 0;
  v_exercise_id UUID;
  v_exercise_owner UUID;
  v_weight DECIMAL;
  v_reps INT;
  v_estimated_1rm DECIMAL;
  v_current_best DECIMAL;
  v_new_prs jsonb := '[]'::jsonb;
  v_custom jsonb;
  v_custom_id UUID;
  v_custom_name TEXT;
  v_custom_owner UUID;
  v_custom_is_custom BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_workout_id := COALESCE((payload->>'id')::UUID, gen_random_uuid());

  -- Ownership: el ON CONFLICT solo no alcanza — sin este check,
  -- adivinar un UUID ajeno permitiría pisar el workout de otro.
  SELECT user_id INTO v_owner FROM public.workouts WHERE id = v_workout_id;
  IF FOUND AND v_owner <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.workouts (id, user_id, date, title, notes, duration_minutes)
  VALUES (
    v_workout_id,
    v_user_id,
    COALESCE((payload->>'date')::DATE, CURRENT_DATE),
    NULLIF(payload->>'title', ''),
    payload->>'notes',
    (payload->>'duration_minutes')::INT
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    notes = EXCLUDED.notes,
    duration_minutes = EXCLUDED.duration_minutes,
    updated_at = now();

  -- Los custom van ANTES de las tarjetas: son la FK que las tarjetas y las series necesitan.
  -- La clave es opcional para que un payload sin ejercicios propios siga andando.
  FOR v_custom IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'custom_exercises', '[]'::jsonb))
  LOOP
    v_custom_id := (v_custom->>'id')::UUID;
    v_custom_name := btrim(v_custom->>'name');

    -- Un nombre vacío no es un nombre. `NOT NULL` lo frenaría igual, pero con un
    -- mensaje que no se le puede mostrar a nadie.
    IF COALESCE(v_custom_name, '') = '' THEN
      RAISE EXCEPTION 'Custom exercise name is required';
    END IF;

    SELECT created_by, is_custom INTO v_custom_owner, v_custom_is_custom
    FROM public.exercises WHERE id = v_custom_id;

    IF FOUND THEN
      -- Reintento de la cola, o alguien adivinando un UUID. Solo lo primero pasa.
      IF v_custom_owner IS DISTINCT FROM v_user_id OR v_custom_is_custom IS NOT TRUE THEN
        RAISE EXCEPTION 'Forbidden';
      END IF;
    ELSE
      INSERT INTO public.exercises (id, name, muscle_group_id, is_custom, created_by)
      VALUES (
        v_custom_id,
        v_custom_name,
        NULLIF(v_custom->>'muscle_group_id', '')::UUID,
        true,
        v_user_id
      );
    END IF;
  END LOOP;

  /*
   * Las tarjetas, normalizadas a una sola forma.
   *
   * Las dos ramas terminan en el mismo array, y por eso el loop de abajo se escribe una vez: la
   * compatibilidad no se paga con un segundo camino de inserción que se puede desincronizar del
   * primero, se paga acá arriba, en la lectura.
   */
  IF jsonb_typeof(payload->'exercises') = 'array' THEN
    v_cards := payload->'exercises';
  ELSE
    /*
     * La forma vieja: series planas en `sets` y objetivos en `exercise_targets`. Se reconstruyen las
     * tarjetas, ordenadas por la posición del objetivo y, los ejercicios que sólo tienen series,
     * después y por su menor `set_number`. El `position` que sale de acá **sólo ordena el array**: la
     * posición que se guarda la numera el contador del loop, densa desde uno.
     */
    WITH target AS (
      SELECT DISTINCT ON ((e->>'exercise_id')::UUID)
        (e->>'exercise_id')::UUID AS exercise_id,
        (e->>'position')::INT AS target_position,
        (e->>'target_reps')::INT AS target_reps,
        (e->>'target_weight_min')::DECIMAL AS target_weight_min,
        (e->>'target_weight_max')::DECIMAL AS target_weight_max
      FROM jsonb_array_elements(COALESCE(payload->'exercise_targets', '[]'::jsonb)) AS e
      ORDER BY (e->>'exercise_id')::UUID, (e->>'position')::INT
    ),
    set_totals AS (
      SELECT (e->>'exercise_id')::UUID AS exercise_id, MIN((e->>'set_number')::INT) AS min_set_number
      FROM jsonb_array_elements(COALESCE(payload->'sets', '[]'::jsonb)) AS e
      GROUP BY 1
    ),
    pairs AS (
      SELECT exercise_id FROM target
      UNION
      SELECT exercise_id FROM set_totals
    ),
    ordered AS (
      SELECT
        p.exercise_id,
        t.target_reps,
        t.target_weight_min,
        t.target_weight_max,
        ROW_NUMBER() OVER (
          ORDER BY t.target_position NULLS LAST, s.min_set_number NULLS LAST, p.exercise_id
        ) AS position
      FROM pairs p
      LEFT JOIN target t ON t.exercise_id = p.exercise_id
      LEFT JOIN set_totals s ON s.exercise_id = p.exercise_id
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'exercise_id', o.exercise_id,
        'target_reps', o.target_reps,
        'target_weight_min', o.target_weight_min,
        'target_weight_max', o.target_weight_max,
        'sets', COALESCE((
          SELECT jsonb_agg(e)
          FROM jsonb_array_elements(COALESCE(payload->'sets', '[]'::jsonb)) AS e
          WHERE (e->>'exercise_id')::UUID = o.exercise_id
        ), '[]'::jsonb)
      ) ORDER BY o.position
    ), '[]'::jsonb)
    INTO v_cards
    FROM ordered o;
  END IF;

  -- Reemplazo completo, y en este orden: las series primero, para que el CASCADE del FK no tenga
  -- que hacer el trabajo que la intención ya hizo. Es lo que hace idempotente a un reintento.
  DELETE FROM public.workout_sets WHERE workout_id = v_workout_id;
  DELETE FROM public.workout_exercises WHERE workout_id = v_workout_id;

  FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards)
  LOOP
    -- La posición la escribe el RPC y sale del orden del array. Numerada densa: el UNIQUE
    -- (workout_id, position) no puede fallar por un número que mandó el cliente.
    v_card_position := v_card_position + 1;
    v_exercise_id := (v_card->>'exercise_id')::UUID;

    -- La FK sólo pide que la fila exista; esto pide que sea visible. El catálogo
    -- global (created_by IS NULL) es de todos y pasa; el custom de otro no, ni
    -- aunque se adivine su UUID (0011).
    SELECT created_by INTO v_exercise_owner
    FROM public.exercises WHERE id = v_exercise_id;
    IF v_exercise_owner IS NOT NULL AND v_exercise_owner <> v_user_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    INSERT INTO public.workout_exercises (
      workout_id, user_id, exercise_id, position,
      target_reps, target_weight_min, target_weight_max
    ) VALUES (
      v_workout_id,
      v_user_id,
      v_exercise_id,
      v_card_position,
      (v_card->>'target_reps')::INT,
      (v_card->>'target_weight_min')::DECIMAL,
      (v_card->>'target_weight_max')::DECIMAL
    )
    RETURNING id INTO v_card_id;

    -- Las series de ESTA tarjeta. Una tarjeta sin series es una tarjeta real —alguien la agregó y no
    -- llegó a anotar nada— y por eso guarda su lugar y su objetivo aunque el array venga vacío.
    FOR v_set IN SELECT * FROM jsonb_array_elements(COALESCE(v_card->'sets', '[]'::jsonb))
    LOOP
      v_weight := (v_set->>'weight_kg')::DECIMAL;
      v_reps := (v_set->>'reps')::INT;

      INSERT INTO public.workout_sets (
        id, workout_id, user_id, exercise_id, workout_exercise_id,
        set_number, reps, weight_kg, rpe, is_warmup, notes
      ) VALUES (
        COALESCE((v_set->>'id')::UUID, gen_random_uuid()),
        v_workout_id,
        v_user_id,
        v_exercise_id,
        v_card_id,
        (v_set->>'set_number')::INT,
        v_reps,
        v_weight,
        (v_set->>'rpe')::DECIMAL,
        COALESCE((v_set->>'is_warmup')::BOOLEAN, false),
        v_set->>'notes'
      );

      -- PR por 1RM Epley; warmups no cuentan
      IF v_weight IS NOT NULL AND v_reps IS NOT NULL
         AND v_weight > 0 AND v_reps > 0
         AND COALESCE((v_set->>'is_warmup')::BOOLEAN, false) = false
      THEN
        v_estimated_1rm := v_weight * (1 + v_reps::DECIMAL / 30);

        SELECT best_1rm INTO v_current_best
        FROM public.personal_records
        WHERE user_id = v_user_id AND exercise_id = v_exercise_id;

        IF v_current_best IS NULL OR v_estimated_1rm > v_current_best THEN
          INSERT INTO public.personal_records
            (user_id, exercise_id, best_1rm, max_weight_kg, max_reps_at_max_weight, achieved_at)
          VALUES (v_user_id, v_exercise_id, v_estimated_1rm, v_weight, v_reps, CURRENT_DATE)
          ON CONFLICT (user_id, exercise_id) DO UPDATE SET
            best_1rm = EXCLUDED.best_1rm,
            max_weight_kg = EXCLUDED.max_weight_kg,
            max_reps_at_max_weight = EXCLUDED.max_reps_at_max_weight,
            achieved_at = EXCLUDED.achieved_at;

          v_new_prs := v_new_prs || jsonb_build_object(
            'exercise_id', v_exercise_id,
            'old_1rm', v_current_best,
            'new_1rm', v_estimated_1rm,
            'weight', v_weight,
            'reps', v_reps
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('workout_id', v_workout_id, 'new_prs', v_new_prs);
END;
$$;

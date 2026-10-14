-- =============================================
-- 0009 — el objetivo por ejercicio de una sesión
--
-- El usuario pidió poder fijar, al agregar un ejercicio a un entrenamiento, "la cantidad de
-- repeticiones y el peso minimo y max". Es un **objetivo de esa sesión**, no una propiedad del
-- ejercicio: la misma persona puede proponerse 60–80 kg un día y 70–90 la semana siguiente. Por
-- eso vive con el entrenamiento y no en `exercises`, que es la tabla que comparten todos.
--
-- La clave lleva la POSICIÓN y eso no es decorativo. Un mismo ejercicio puede aparecer dos veces
-- en una sesión —el store lo permite a propósito, y `workout_sets` no tiene unique sobre
-- `(workout_id, exercise_id, set_number)`, verificado al escribir T3.9a—, y la posición es el
-- lugar de la tarjeta en la sesión. Sin ella, la segunda tarjeta pisaría a la primera.
--
-- Sobre la seguridad, la misma lección que 0008: esta tabla la escribe `save_workout`, que es
-- SECURITY DEFINER, y Postgres **no aplica RLS al dueño de la tabla**. La policy de acá abajo
-- protege la lectura y la escritura directas (Fase 4 va a leerlas), pero **no** protege el INSERT
-- de la función: lo que impide escribir sobre un workout ajeno es el check de ownership que ya
-- está al principio de `save_workout`, antes de tocar nada.
--
-- Lo que NO se valida, a propósito: que `target_weight_min` sea menor que `target_weight_max`. Los
-- dos campos se escriben de a uno, así que un rango invertido es un estado **transitorio real**
-- mientras alguien tipea, y un CHECK acá convertiría eso en un guardado que falla entero. La UI es
-- quien tiene la información para ordenarlo; la base no puede distinguir un error de un teclazo.
--
-- El payload que lee la función, y que el cliente tiene que mandar igual:
--   "exercise_targets": [{ "exercise_id": uuid, "position": int,
--                          "target_reps": int|null,
--                          "target_weight_min": number|null,
--                          "target_weight_max": number|null }]
-- La clave es opcional, como `custom_exercises`: un payload sin objetivos sigue andando.
--
-- La firma de `save_workout` no cambia, así que el `REVOKE`/`GRANT` de 0003 sigue valiendo.
-- =============================================

CREATE TABLE public.workout_exercise_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  position INT NOT NULL,
  target_reps INT,
  target_weight_min DECIMAL(6,2),
  target_weight_max DECIMAL(6,2),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (workout_id, exercise_id, position),

  -- La misma integridad de dueño que 0004 le puso a workout_sets, por el mismo motivo: que el
  -- `user_id` de la fila no pueda discrepar del dueño del workout, ni por un bug del cliente.
  CONSTRAINT workout_exercise_targets_owner_fkey
    FOREIGN KEY (workout_id, user_id) REFERENCES public.workouts(id, user_id) ON DELETE CASCADE,

  -- Nada imposible: un objetivo no puede pedir cero repeticiones ni un peso negativo.
  CHECK (target_reps IS NULL OR target_reps > 0),
  CHECK (target_weight_min IS NULL OR target_weight_min >= 0),
  CHECK (target_weight_max IS NULL OR target_weight_max >= 0)
);

ALTER TABLE public.workout_exercise_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own targets"
  ON public.workout_exercise_targets FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- El GRANT explícito, por lo que documenta 0003: RLS filtra filas dentro de los privilegios que
-- el rol ya tiene, y sin GRANT todo falla con 42501 aunque la policy exista.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_exercise_targets TO authenticated;

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
  v_set jsonb;
  v_exercise_id UUID;
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
  v_target jsonb;
  v_target_position INT;
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

  -- Los custom van ANTES de las series: son la FK que las series necesitan.
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

  -- Reemplazo completo de sets (idempotente ante reintentos offline)
  DELETE FROM public.workout_sets WHERE workout_id = v_workout_id;

  FOR v_set IN SELECT * FROM jsonb_array_elements(payload->'sets')
  LOOP
    v_exercise_id := (v_set->>'exercise_id')::UUID;
    v_weight := (v_set->>'weight_kg')::DECIMAL;
    v_reps := (v_set->>'reps')::INT;

    INSERT INTO public.workout_sets (
      id, workout_id, user_id, exercise_id,
      set_number, reps, weight_kg, rpe, is_warmup, notes
    ) VALUES (
      COALESCE((v_set->>'id')::UUID, gen_random_uuid()),
      v_workout_id,
      v_user_id,
      v_exercise_id,
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

  -- El objetivo de cada tarjeta. Reemplazo completo, igual que las series: un reintento de la
  -- cola con el mismo payload reescribe las mismas filas en vez de duplicarlas.
  DELETE FROM public.workout_exercise_targets WHERE workout_id = v_workout_id;

  FOR v_target IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'exercise_targets', '[]'::jsonb))
  LOOP
    v_target_position := (v_target->>'position')::INT;

    -- Sin posición no se sabe de qué tarjeta es el objetivo, y `NOT NULL` lo frenaría con un
    -- mensaje que no dice nada.
    IF v_target_position IS NULL THEN
      RAISE EXCEPTION 'Target position is required';
    END IF;

    INSERT INTO public.workout_exercise_targets (
      workout_id, user_id, exercise_id, position,
      target_reps, target_weight_min, target_weight_max
    ) VALUES (
      v_workout_id,
      v_user_id,
      (v_target->>'exercise_id')::UUID,
      v_target_position,
      (v_target->>'target_reps')::INT,
      (v_target->>'target_weight_min')::DECIMAL,
      (v_target->>'target_weight_max')::DECIMAL
    );
  END LOOP;

  RETURN jsonb_build_object('workout_id', v_workout_id, 'new_prs', v_new_prs);
END;
$$;

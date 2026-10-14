-- =============================================
-- 0011 — `save_workout` valida el dueño del ejercicio que inserta
--
-- Hallazgo, confirmado con una sonda real contra la base local (rol `authenticated`, JWT de B,
-- por el camino de la RPC): `save_workout` validaba el dueño del workout y el de los ejercicios
-- que vienen en `custom_exercises`, pero **no** el `exercise_id` de las series ni el de los
-- objetivos. La FK de `workout_sets.exercise_id` (y la de `workout_exercise_targets.exercise_id`)
-- sólo exige que la fila exista, no que sea visible: un UUID adivinado del custom de otra persona
-- alcanzaba para insertar filas propias apuntándolo.
--
-- Y el impacto no es cosmético: mientras esas filas existan, **nadie** puede borrar el ejercicio
-- custom de su dueño, ni el dueño ni el administrador. El FK lo frena con 23503
-- (`update or delete on table "exercises" violates foreign key constraint
--  "workout_sets_exercise_id_fkey"`). Un usuario podía volver indeleble el dato de otro.
--
-- Por qué el guard vive acá y no en una policy: `save_workout` es SECURITY DEFINER y Postgres
-- **no aplica RLS al dueño de la tabla**. Las policies de `workout_sets` y
-- `workout_exercise_targets` protegen la lectura y la escritura directas, pero no el INSERT de la
-- función —que corre como el dueño y por eso atraviesa RLS—. Lo único que puede frenar este
-- camino es el código de la función, y por eso está escrito acá. Es el mismo criterio, y la misma
-- lección, que 0008: el guard que falta es el de `custom_exercises`, `created_by IS NOT NULL AND
-- created_by <> v_user_id`, y acá se aplica tal cual a cada `exercise_id` que se inserta.
--
-- El catálogo global (`created_by IS NULL`) sigue pasando: es de todos. Y los propios, también.
-- Nada más.
--
-- Además, `position > 0` como constraint declarativa: la posición es el orden de la tarjeta en la
-- sesión, y un cero o un negativo no es un lugar. El código de la función ya frena la posición
-- ausente con un mensaje legible; esto es la red de la base para los valores que sí llegan.
--
-- La firma de `save_workout` no cambia, así que el `REVOKE`/`GRANT` de 0003 sigue valiendo:
-- reemplazar una función no toca sus permisos.
-- =============================================

-- La posición es un orden 1-based. El UNIQUE (workout_id, exercise_id, position) ya la usa para
-- distinguir dos tarjetas del mismo ejercicio; sin el piso, una posición 0 o negativa entraría
-- como una tarjeta más.
ALTER TABLE public.workout_exercise_targets
  ADD CONSTRAINT workout_exercise_targets_position_positive CHECK (position > 0);

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

    -- La FK sólo pide que la fila exista; esto pide que sea visible. El catálogo
    -- global (created_by IS NULL) es de todos y pasa; el custom de otro no, ni
    -- aunque se adivine su UUID.
    SELECT created_by INTO v_exercise_owner
    FROM public.exercises WHERE id = v_exercise_id;
    IF v_exercise_owner IS NOT NULL AND v_exercise_owner <> v_user_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

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
    v_exercise_id := (v_target->>'exercise_id')::UUID;

    -- Sin posición no se sabe de qué tarjeta es el objetivo, y `NOT NULL` lo frenaría con un
    -- mensaje que no dice nada.
    IF v_target_position IS NULL THEN
      RAISE EXCEPTION 'Target position is required';
    END IF;

    -- Mismo guard que las series: la FK sola no impide apuntarle un objetivo al custom de otro,
    -- y el custom ajeno quedaría indeleble por ese objetivo.
    SELECT created_by INTO v_exercise_owner
    FROM public.exercises WHERE id = v_exercise_id;
    IF v_exercise_owner IS NOT NULL AND v_exercise_owner <> v_user_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    INSERT INTO public.workout_exercise_targets (
      workout_id, user_id, exercise_id, position,
      target_reps, target_weight_min, target_weight_max
    ) VALUES (
      v_workout_id,
      v_user_id,
      v_exercise_id,
      v_target_position,
      (v_target->>'target_reps')::INT,
      (v_target->>'target_weight_min')::DECIMAL,
      (v_target->>'target_weight_max')::DECIMAL
    );
  END LOOP;

  RETURN jsonb_build_object('workout_id', v_workout_id, 'new_prs', v_new_prs);
END;
$$;

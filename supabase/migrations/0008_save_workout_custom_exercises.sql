-- =============================================
-- 0008 — `save_workout` crea los ejercicios custom que el payload trae
--
-- Un ejercicio custom se crea en el cliente con un UUID v7 (nunca llega al
-- servidor antes), así que cuando el workout se sincroniza las series ya lo
-- referencian. Hasta acá eso fallaba: `workout_sets.exercise_id` tiene FK contra
-- `exercises(id)` y la fila no existía, así que **guardar un entrenamiento con un
-- ejercicio propio era imposible**. El plan lo pedía explícitamente ("crear fila
-- custom primero") y no estaba implementado.
--
-- OJO con de dónde viene la seguridad de este camino. La función es SECURITY
-- DEFINER y Postgres **no aplica RLS al dueño de la tabla**, así que la policy
-- `insert own custom` de 0001 **no protege este INSERT**. El único guard es el que
-- está escrito acá abajo, y por eso está.
--
-- El invariante que impone, y es el mismo criterio que ya usa el workout: una fila
-- que ya existe y no es tuya es algo que esta función no toca. Sin ese check,
-- adivinar un UUID ajeno alcanzaba para colgar las series propias de un ejercicio
-- custom de otro. El caso global (`created_by IS NULL`) también queda afuera: un
-- cliente no "crea" un ejercicio del catálogo compartido.
--
-- Idempotencia: si la fila ya existe y es del usuario, no se hace nada. Un
-- reintento de la cola offline con el mismo payload no duplica ni pisa el nombre.
-- Renombrar un custom no está en el alcance del MVP, así que no se actualiza.
--
-- La firma no cambia, así que el `REVOKE`/`GRANT` de 0003 sigue valiendo:
-- reemplazar una función no toca sus permisos.
-- =============================================

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

  RETURN jsonb_build_object('workout_id', v_workout_id, 'new_prs', v_new_prs);
END;
$$;

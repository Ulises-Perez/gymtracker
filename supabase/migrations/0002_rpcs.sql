-- =============================================
-- GymTracker · 0002_rpcs — funciones de negocio
-- Todas SECURITY DEFINER con search_path fijo.
-- Se otorga EXECUTE a authenticated (si no, el cliente no puede llamarlas).
-- =============================================

-- ---- Guardar workout atómico: workout + sets + PRs en 1 transacción ----
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

-- ---- Progreso agregado por ejercicio (la gráfica no calcula en cliente) ----
CREATE OR REPLACE FUNCTION public.exercise_progress(p_exercise_id UUID)
RETURNS TABLE (
  workout_date DATE,
  max_weight DECIMAL,
  total_volume DECIMAL,
  best_set_1rm DECIMAL,
  total_sets INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    w.date AS workout_date,
    MAX(ws.weight_kg) AS max_weight,
    SUM(ws.weight_kg * ws.reps) AS total_volume,
    MAX(ws.weight_kg * (1 + ws.reps::DECIMAL / 30)) AS best_set_1rm,
    COUNT(*)::INT AS total_sets
  FROM public.workout_sets ws
  JOIN public.workouts w ON w.id = ws.workout_id
  WHERE ws.exercise_id = p_exercise_id
    AND ws.user_id = (select auth.uid())
    AND ws.is_warmup = false
    AND ws.deleted_at IS NULL
    AND w.deleted_at IS NULL
  GROUP BY w.date
  ORDER BY w.date ASC;
$$;

-- ---- Resumen del dashboard en 1 sola llamada ----
CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_result jsonb;
  v_week_start DATE := date_trunc('week', CURRENT_DATE)::DATE;
  v_streak INT := 0;
  v_check_date DATE := CURRENT_DATE;
BEGIN
  -- Si hoy aún no entrenó, la racha se cuenta desde ayer
  -- (si no, entrenar ayer + hoy temprano da racha 0).
  IF NOT EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = v_user_id AND date = CURRENT_DATE AND deleted_at IS NULL
  ) THEN
    v_check_date := CURRENT_DATE - 1;
  END IF;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.workouts
      WHERE user_id = v_user_id AND date = v_check_date AND deleted_at IS NULL
    );
    v_streak := v_streak + 1;
    v_check_date := v_check_date - 1;
  END LOOP;

  SELECT jsonb_build_object(
    'streak', v_streak,
    'week_days', (
      SELECT COALESCE(jsonb_agg(DISTINCT w.date ORDER BY w.date), '[]'::jsonb)
      FROM public.workouts w
      WHERE w.user_id = v_user_id
        AND w.date >= v_week_start
        AND w.deleted_at IS NULL
    ),
    -- OJO: el LIMIT tiene que ir en una subconsulta. Un jsonb_agg sin
    -- GROUP BY devuelve UNA fila, así que un LIMIT en la misma query
    -- nunca recortaría los PRs (bug detectado en revisión).
    'recent_prs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'exercise_id', x.exercise_id,
        'exercise_name', x.exercise_name,
        'best_1rm', x.best_1rm,
        'max_weight_kg', x.max_weight_kg,
        'max_reps', x.max_reps,
        'achieved_at', x.achieved_at
      ) ORDER BY x.achieved_at DESC), '[]'::jsonb)
      FROM (
        SELECT pr.exercise_id,
               e.name AS exercise_name,
               pr.best_1rm,
               pr.max_weight_kg,
               pr.max_reps_at_max_weight AS max_reps,
               pr.achieved_at
        FROM public.personal_records pr
        JOIN public.exercises e ON e.id = pr.exercise_id
        WHERE pr.user_id = v_user_id
        ORDER BY pr.achieved_at DESC
        LIMIT 5
      ) x
    ),
    'last_workout', (
      SELECT jsonb_build_object(
        'id', w.id,
        'date', w.date,
        'title', w.title,
        'duration_minutes', w.duration_minutes,
        'exercise_count', (
          SELECT COUNT(DISTINCT ws.exercise_id)
          FROM public.workout_sets ws
          WHERE ws.workout_id = w.id AND ws.deleted_at IS NULL
        )
      )
      FROM public.workouts w
      WHERE w.user_id = v_user_id AND w.deleted_at IS NULL
      ORDER BY w.date DESC, w.created_at DESC
      LIMIT 1
    ),
    'total_workouts', (
      SELECT COUNT(*) FROM public.workouts
      WHERE user_id = v_user_id AND deleted_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ---- Últimas series de un ejercicio (referencia "último: 3×10 @ 70kg") ----
-- Primero se identifica el ÚLTIMO workout que contenga el ejercicio y
-- después se traen sus sets: ORDER BY + LIMIT directo mezclaría
-- series de dos workouts distintos.
CREATE OR REPLACE FUNCTION public.last_weight_for_exercise(p_exercise_id UUID)
RETURNS TABLE (set_number INT, reps INT, weight_kg DECIMAL)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH last_w AS (
    SELECT w.id AS workout_id
    FROM public.workout_sets ws
    JOIN public.workouts w ON w.id = ws.workout_id
    WHERE ws.exercise_id = p_exercise_id
      AND ws.user_id = (select auth.uid())
      AND ws.deleted_at IS NULL
      AND w.deleted_at IS NULL
    ORDER BY w.date DESC, w.created_at DESC
    LIMIT 1
  )
  SELECT ws.set_number, ws.reps, ws.weight_kg
  FROM public.workout_sets ws
  JOIN last_w ON last_w.workout_id = ws.workout_id
  WHERE ws.exercise_id = p_exercise_id
    AND ws.deleted_at IS NULL
  ORDER BY ws.set_number ASC;
$$;

-- ---- Permisos de ejecución para el cliente ----
-- Endurecimiento: Postgres otorga EXECUTE a PUBLIC por defecto, y PUBLIC
-- incluye a anon. Se revoca antes de otorgar solo a los roles que importan.
REVOKE EXECUTE ON FUNCTION public.save_workout(jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.exercise_progress(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.last_weight_for_exercise(UUID) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.save_workout(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exercise_progress(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.last_weight_for_exercise(UUID) TO authenticated, service_role;

-- =============================================
-- GymTracker · 0014_dashboard_exercise_count — el Inicio cuenta las tarjetas
--
-- `dashboard_summary()` contaba los ejercicios de la última sesión mirando sus SERIES. Desde 0012
-- los ejercicios de una sesión son las TARJETAS (`workout_exercises`), y una tarjeta existe
-- aunque no tenga series ("una tarjeta sin series es una tarjeta real"). El resultado: una sesión
-- con un ejercicio y ninguna serie salía "0 ejercicios" en el Inicio mientras su propio detalle
-- listaba la tarjeta — dos pantallas de la misma app contradiciéndose sobre la misma sesión.
--
-- La función se reemplaza entera porque es la que se define en 0002 y nunca se volvió a tocar.
-- El GRANT de 0003 sigue en pie: `CREATE OR REPLACE` conserva los privilegios de la función.
--
-- La prueba vive en supabase/tests/0007_dashboard_summary_test.sql, que es la primera cobertura de
-- esta lectura: el RED se vio contra la base local antes de aplicar esto.
-- =============================================

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
          -- Los ejercicios de una sesión son sus TARJETAS (0012), no los de sus series: una
          -- tarjeta sin series es una tarjeta real, y el Inicio tiene que contarla igual que
          -- cuenta las series. Contando las series, una sesión con un ejercicio y ninguna serie
          -- salía "0 ejercicios" en el Inicio mientras su propio detalle listaba la tarjeta.
          SELECT COUNT(DISTINCT we.exercise_id)
          FROM public.workout_exercises we
          WHERE we.workout_id = w.id
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

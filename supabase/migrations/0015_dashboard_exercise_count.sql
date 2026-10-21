-- =============================================
-- GymTracker · 0015_dashboard_exercise_count — el Inicio cuenta las tarjetas, todas
--
-- 0014 dejó el Inicio contando las TARJETAS (`workout_exercises`) y eso arregló el caso de la
-- tarjeta sin series. Pero siguió contando `COUNT(DISTINCT exercise_id)`, y ahí quedaba el mismo
-- defecto con otra cara: **el mismo ejercicio en dos tarjetas**. Desde 0012 la clave de la tarjeta
-- es `(workout_id, position)` y no `(workout_id, exercise_id)` a propósito —"el mismo ejercicio dos
-- veces son dos tarjetas, y lo que las identifica es el lugar, no el ejercicio"—, y el selector no
-- prohíbe agregarlo de nuevo. Una sesión con Press Banca en dos tarjetas decía "1 ejercicio" en el
-- Inicio mientras su propio detalle listaba dos: dos pantallas de la misma app contradiciéndose
-- sobre la misma sesión, igual que antes de 0014.
--
-- **La decisión es del dueño del producto (2026-10-21): el Inicio cuenta las TARJETAS.** El número
-- que muestra es el que lista el detalle, sin traducciones de por medio: una tarjeta es un lugar de
-- la sesión y la sesión se hizo así, incluso si repite ejercicio. Contar ejercicios distintos no es
-- un resumen más amable, es otro número sobre la misma sesión, y el usuario que repite ejercicio a
-- propósito —un bloque de aproximación, un cluster— sólo puede concluir que una de las dos
-- pantallas miente.
--
-- Se reemplaza la función entera, como manda la convención del proyecto (0014 lo hizo igual sobre la
-- definición de 0002): misma firma, mismo `DECLARE`, misma racha, misma tira de la semana, mismos
-- PRs recientes y mismo total. Lo único que cambia es el conteo: `COUNT(*)` sobre las tarjetas de la
-- sesión, sin `DISTINCT` y sin mirar las series —una tarjeta existe aunque no tenga ninguna.
--
-- El `GRANT` de 0003 sigue en pie: `CREATE OR REPLACE` conserva los privilegios de la función.
--
-- La prueba vive en supabase/tests/0007_dashboard_summary_test.sql, donde el caso del mismo
-- ejercicio en dos tarjetas ahora tiene su propia aserción.
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
          -- Cuenta las TARJETAS (0012), no los ejercicios distintos: el mismo ejercicio en dos
          -- tarjetas son dos, y el Inicio tiene que decir lo mismo que lista el detalle. Sin
          -- DISTINCT y sin mirar las series: una tarjeta sin series es una tarjeta real.
          SELECT COUNT(*)
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

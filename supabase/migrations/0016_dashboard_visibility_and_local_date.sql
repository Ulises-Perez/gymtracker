-- =============================================
-- GymTracker · 0016 — la visibilidad del ejercicio y el día local
--
-- Cierra dos hallazgos de la auditoría del 2026-10-21, y los dos son de la misma familia:
-- una regla que el código creía tener y que sólo estaba escrita en un camino.
--
-- 1. `save_workout` valida que el `exercise_id` de cada serie pertenezca al usuario o al
--    catálogo global (0011/0012), pero las tablas `personal_records`, `workout_exercises` y
--    `workout_sets` también se pueden escribir **directo** por PostgREST. Sus policies sólo
--    miran `user_id`, así que un usuario autenticado podía insertar una fila propia apuntando
--    al ejercicio custom de otro: la FK sólo exige que la fila exista, y mientras esa fila
--    exista, el dueño del ejercicio no puede borrarlo (23503). Además, `dashboard_summary`
--    joinea `exercises` sin predicado de visibilidad y devolvía el nombre del ejercicio ajeno.
--
--    El trigger es `SECURITY DEFINER` a propósito. La policy de `exercises` (0007) oculta el
--    custom ajeno al rol `authenticated`; un trigger invocador vería `created_by = NULL` y no
--    podría distinguir "global" de "ajeno". El definer lee la fila, y `auth.uid()` sigue
--    leyendo el JWT de quien escribe, no el dueño de la función.
--
-- 2. `dashboard_summary` usaba `CURRENT_DATE`, el reloj del servidor (UTC). En Buenos Aires,
--    un domingo a las 21:30 ya es lunes en UTC: la semana arrancaba el 19 y el entrenamiento
--    del 18 quedaba afuera, con los siete cuadros en "sin entrenar". La persona vive en su
--    reloj, así que el cliente manda el día local y la función lo usa para la racha y la tira.
--
-- La firma de `dashboard_summary` cambia (suma `p_today` con default), así que la vieja se
-- dropea y la nueva se vuelve a otorgar. `CREATE OR REPLACE` no alcanza: dejaría las dos
-- sobrecargas y la llamada sin argumentos podría resolver a la vieja, con el defecto intacto.
-- =============================================

-- ---------- 1 · el ejercicio que se escribe tiene que ser visible ==========

CREATE OR REPLACE FUNCTION public.check_exercise_visible()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT created_by INTO v_owner
  FROM public.exercises
  WHERE id = NEW.exercise_id;

  -- La FK ya lo frenaría con un mensaje del motor; esto dice lo mismo en el idioma de la app.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercise not found';
  END IF;

  -- `created_by IS NULL` es el catálogo global: es de todos. El custom es de su dueño, y sólo
  -- su dueño puede colgarle filas. Sin este guard, adivinar un UUID ajeno alcanzaba para volver
  -- el ejercicio indeleble para siempre.
  IF v_owner IS NOT NULL AND v_owner <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN NEW;
END;
$$;

-- Las tres tablas que tienen un `exercise_id` escribible y una FK que sólo exige existencia.
-- `UPDATE OF exercise_id` cubre el PATCH directo que repunta una tarjeta (el hallazgo S10).
CREATE TRIGGER trg_personal_records_visible
  BEFORE INSERT OR UPDATE OF exercise_id ON public.personal_records
  FOR EACH ROW EXECUTE FUNCTION public.check_exercise_visible();

CREATE TRIGGER trg_workout_exercises_visible
  BEFORE INSERT OR UPDATE OF exercise_id ON public.workout_exercises
  FOR EACH ROW EXECUTE FUNCTION public.check_exercise_visible();

CREATE TRIGGER trg_workout_sets_visible
  BEFORE INSERT OR UPDATE OF exercise_id ON public.workout_sets
  FOR EACH ROW EXECUTE FUNCTION public.check_exercise_visible();

-- ---------- 2 · el dashboard, con el día local y sin el nombre ajeno ==========

DROP FUNCTION IF EXISTS public.dashboard_summary();

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_today DATE DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_today DATE := COALESCE(p_today, CURRENT_DATE);
  v_result jsonb;
  v_week_start DATE := date_trunc('week', v_today)::DATE;
  v_streak INT := 0;
  v_check_date DATE := v_today;
BEGIN
  -- Si hoy aún no entrenó, la racha se cuenta desde ayer
  -- (si no, entrenar ayer + hoy temprano da racha 0).
  IF NOT EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = v_user_id AND date = v_today AND deleted_at IS NULL
  ) THEN
    v_check_date := v_today - 1;
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
          -- La misma regla que la policy de `exercises`: el custom es de su dueño. Sin
          -- esto, una fila de PR apuntando a un UUID ajeno devolvía el nombre del ejercicio
          -- de la otra persona por el JOIN de una función SECURITY DEFINER.
          AND (COALESCE(e.is_custom, false) = false OR e.created_by = v_user_id)
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

-- La firma nueva es una función nueva: los privilegios de la vieja no la siguen.
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(DATE) TO authenticated, service_role;

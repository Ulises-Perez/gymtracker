-- =============================================
-- GymTracker · 0017 — los récords que el servidor calcula
--
-- Tres defectos de la misma función, todos medidos por la auditoría del 2026-10-21:
--
-- 1. **El 1RM se comparaba sin redondear.** `70 × (1 + 10/30)` da `93.333…`, la columna
--    `DECIMAL(6,2)` guarda `93.33`, y la serie siguiente volvía a dar `93.333… > 93.33`:
--    **3×10 a 70 kg devolvía tres récords**, cada uno "antes 93.3 → 93.3". El test que
--    existía usaba 100×5 = 116.6667, que redondea hacia arriba y por eso no lo veía.
--    Ahora se redondea **antes** de comparar y de guardar.
--
-- 2. **La fecha del récord era la del reintento.** `achieved_at` usaba `CURRENT_DATE`, así
--    que un guardado hecho el lunes y reintentado el miércoles movía el récord al miércoles.
--    Ahora usa la fecha del payload, que es la de la sesión.
--
-- 3. **Un guardado concurrente podía bajar el récord.** El `ON CONFLICT DO UPDATE` era
--    incondicional: dos sesiones que se intercalaban dejaban el best en el último commit
--    aunque fuera menor. La actualización ahora sólo ocurre si el valor nuevo es mayor, y
--    la respuesta sólo anuncia el récord si la fila se actualizó de verdad.
--
-- También se ensancha `personal_records.best_1rm` a `DECIMAL(10,2)`. El 1RM de un peso
-- válido (hasta 9999,99 kg) por muchas reps puede superar los 9999,99 que allowaba la
-- columna vieja; el tope superior del peso, del lado del cliente, no alcanza si la columna
-- no puede guardar el resultado de Epley.
--
-- La firma no cambia, así que el REVOKE/GRANT de 0003 sigue valiendo: reemplazar una
-- función no toca sus permisos.
-- =============================================

ALTER TABLE public.personal_records
  ALTER COLUMN best_1rm TYPE DECIMAL(10,2);

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
  v_rows INT;
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

      -- PR por 1RM Epley; warmups no cuentan. El redondeo a dos decimales es el de la columna:
      -- sin él, 93.333… se guardaba como 93.33 y la serie siguiente volvía a "superarlo" para
      -- siempre. Se redondea antes de comparar y de escribir, no después.
      IF v_weight IS NOT NULL AND v_reps IS NOT NULL
         AND v_weight > 0 AND v_reps > 0
         AND COALESCE((v_set->>'is_warmup')::BOOLEAN, false) = false
      THEN
        v_estimated_1rm := round(v_weight * (1 + v_reps::DECIMAL / 30), 2);

        SELECT best_1rm INTO v_current_best
        FROM public.personal_records
        WHERE user_id = v_user_id AND exercise_id = v_exercise_id;

        IF v_current_best IS NULL OR v_estimated_1rm > v_current_best THEN
          INSERT INTO public.personal_records
            (user_id, exercise_id, best_1rm, max_weight_kg, max_reps_at_max_weight, achieved_at)
          VALUES (
            v_user_id,
            v_exercise_id,
            v_estimated_1rm,
            v_weight,
            v_reps,
            -- La fecha de la sesión, no la del reintento: un guardado del lunes que se
            -- sincroniza el miércoles sigue perteneciendo al lunes.
            COALESCE((payload->>'date')::DATE, CURRENT_DATE)
          )
          ON CONFLICT (user_id, exercise_id) DO UPDATE SET
            best_1rm = EXCLUDED.best_1rm,
            max_weight_kg = EXCLUDED.max_weight_kg,
            max_reps_at_max_weight = EXCLUDED.max_reps_at_max_weight,
            achieved_at = EXCLUDED.achieved_at
          -- Monotónico bajo concurrencia: si otra transacción ya escribió un valor mayor,
          -- esta no lo baja. El WHERE hace que la fila no se actualice, y el ROW_COUNT de
          -- abajo evita anunciar un récord que no ocurrió.
          WHERE public.personal_records.best_1rm IS NULL
             OR EXCLUDED.best_1rm > public.personal_records.best_1rm;

          GET DIAGNOSTICS v_rows = ROW_COUNT;

          IF v_rows > 0 THEN
            v_new_prs := v_new_prs || jsonb_build_object(
              'exercise_id', v_exercise_id,
              -- El récord que esta serie reemplazó en el momento en que se escribió. La
              -- confirmación cuenta ejercicios distintos; el panel puede mostrar la escalera
              -- de mejoras dentro de la sesión.
              'old_1rm', v_current_best,
              'new_1rm', v_estimated_1rm,
              'weight', v_weight,
              'reps', v_reps
            );
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('workout_id', v_workout_id, 'new_prs', v_new_prs);
END;
$$;

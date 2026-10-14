-- =============================================
-- GymTracker · 0005_targets_test — el objetivo por ejercicio de una sesión
-- Corre con: npx supabase test db   (local)   ·   npx supabase test db --linked   (hosted)
--
-- Cubre 0009: la tabla `workout_exercise_targets` y su escritura desde `save_workout`; y 0011:
-- el guard de dueño del ejercicio que la función aplica a series y objetivos.
--
-- Las aserciones que más valen no son las del camino feliz:
--   · el mismo ejercicio en DOS tarjetas guarda DOS objetivos distintos, que es la única razón
--     por la que la clave lleva la posición;
--   · un payload que ya no trae objetivos los borra, porque el guardado reemplaza y no acumula;
--   · B no ve los objetivos de A, y tampoco puede escribir sobre el workout de A. Son dos
--     caminos distintos: la lectura directa la protege la policy, y el INSERT de la función lo
--     protege el check de ownership de `save_workout`, porque SECURITY DEFINER **no** pasa por RLS.
--   · la FK sola no alcanza para el `exercise_id`: exige que la fila exista, no que sea visible.
--     Adivinar el UUID del custom ajeno permitía colgarle filas propias y dejarlo indeleble, así
--     que la función también valida el dueño de cada ejercicio que inserta (0011).
--
-- Impersonación con el patrón del resto de la suite: `set local role authenticated` +
-- `request.jwt.claims`, y las aserciones de vuelta como `postgres`. Todo termina en rollback, así
-- que no queda nada en la base contra la que se corra.
-- =============================================

begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'pgtap-targets-a@example.test'),
  ('00000000-0000-4000-a000-000000000002', 'pgtap-targets-b@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-a000-000000000001'::uuid as user_a,
  '00000000-0000-4000-a000-000000000002'::uuid as user_b,
  '33333333-3333-4333-8333-333333333333'::uuid as workout_a,
  '77777777-7777-4777-8777-777777777777'::uuid as workout_cascade,
  '66666666-6666-4666-8666-666666666666'::uuid as custom_a,
  '88888888-8888-4888-8888-888888888888'::uuid as set_a,
  '99999999-9999-4999-8999-999999999999'::uuid as workout_b,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid as custom_b,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid as set_b,
  (select id from public.exercises where name = 'Press Banca' and is_custom = false) as press_banca;

-- ---------- caso 1: A guarda un workout con tres objetivos ----------
do $case1$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'title', 'Dia de empuje',
    'custom_exercises', jsonb_build_array(
      jsonb_build_object('id', c.custom_a, 'name', 'Press con banda', 'muscle_group_id', null)
    ),
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', c.set_a, 'exercise_id', c.press_banca, 'set_number', 1,
        'reps', 10, 'weight_kg', 60, 'is_warmup', false
      )
    ),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1,
                         'target_reps', 10, 'target_weight_min', 60, 'target_weight_max', 80),
      -- La MISMA prensa otra vez, en la segunda tarjeta, con otro objetivo. Es el caso que la
      -- clave tiene que soportar: sin la posición, esta fila pisaría a la de arriba.
      jsonb_build_object('exercise_id', c.press_banca, 'position', 2,
                         'target_reps', 5, 'target_weight_min', 90, 'target_weight_max', 100),
      -- Un objetivo a medias: sólo reps. S4 dice que los tres campos son independientes.
      jsonb_build_object('exercise_id', c.custom_a, 'position', 3, 'target_reps', 12)
    )
  ));
  set local role postgres;
end;
$case1$;

select is(
  (select count(*)::int from public.workout_exercise_targets
   where workout_id = (select workout_a from t_ctx)),
  3,
  'se guardan los tres objetivos, incluidos los dos del MISMO ejercicio'
);

select is(
  (select target_reps from public.workout_exercise_targets
   where workout_id = (select workout_a from t_ctx) and position = 2),
  5,
  'la segunda tarjeta del mismo ejercicio conserva su propio objetivo'
);

select ok(
  (select target_weight_min = 60 and target_weight_max = 80
   from public.workout_exercise_targets
   where workout_id = (select workout_a from t_ctx) and position = 1),
  'y la primera conserva el suyo: la segunda no la pisó'
);

select ok(
  (select target_weight_min is null and target_weight_max is null
   from public.workout_exercise_targets
   where workout_id = (select workout_a from t_ctx) and position = 3),
  'los tres campos son independientes: un objetivo con sólo reps guarda null en el resto'
);

select is(
  (select sets.reps from public.workout_sets as sets
   where sets.id = (select set_a from t_ctx)),
  10,
  'las series siguen guardándose igual: el objetivo no las reemplaza'
);

-- ---------- caso 2: reintento de la cola con el mismo payload ----------
do $case2$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'title', 'Dia de empuje',
    'custom_exercises', jsonb_build_array(
      jsonb_build_object('id', c.custom_a, 'name', 'Press con banda', 'muscle_group_id', null)
    ),
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1,
                         'target_reps', 10, 'target_weight_min', 60, 'target_weight_max', 80),
      jsonb_build_object('exercise_id', c.press_banca, 'position', 2,
                         'target_reps', 5, 'target_weight_min', 90, 'target_weight_max', 100),
      jsonb_build_object('exercise_id', c.custom_a, 'position', 3, 'target_reps', 12)
    )
  ));
  set local role postgres;
end;
$case2$;

select is(
  (select count(*)::int from public.workout_exercise_targets
   where workout_id = (select workout_a from t_ctx)),
  3,
  'un reintento de la cola con el mismo payload no duplica: el guardado reemplaza'
);

-- ---------- caso 3: B no ve los objetivos de A ----------
do $case3$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;
  /*
   * Esta es la ÚNICA que no vuelve a `postgres` al salir, y es a propósito: lo que se afirma justo
   * después es lo que B ve *como* B. Volver al rol administrativo acá haría que la aserción leyera
   * como superusuario —que atraviesa RLS— y pasara siempre. El bloque siguiente empieza devolviendo
   * el rol por eso mismo.
   */
end;
$case3$;

select is(
  (select count(*)::int from public.workout_exercise_targets),
  0,
  'B no ve ningún objetivo de A: la policy de lectura funciona'
);

-- ---------- caso 4: B no puede escribir sobre el workout de A ----------
do $case4$
declare
  c record;
begin
  -- El caso anterior dejó la sesión como B a propósito; hay que volver para poder leer el contexto.
  set local role postgres;
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1, 'target_reps', 1)
    )
  ));
exception when others then
  perform set_config('gt.err_overwrite', sqlerrm, true);
  set local role postgres;
end;
$case4$;

select is(
  current_setting('gt.err_overwrite', true),
  'Forbidden',
  'adivinar el UUID de un workout ajeno no alcanza para escribirle un objetivo'
);

-- ---------- caso 5: un objetivo sin posición ----------
do $case5$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'target_reps', 8)
    )
  ));
exception when others then
  perform set_config('gt.err_position', sqlerrm, true);
  set local role postgres;
end;
$case5$;

select is(
  current_setting('gt.err_position', true),
  'Target position is required',
  'un objetivo sin posición se rechaza con un mensaje que se le puede mostrar a alguien'
);

-- ---------- caso 6: cero repeticiones ----------
do $case6$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1, 'target_reps', 0)
    )
  ));
exception when others then
  perform set_config('gt.state_reps', sqlstate, true);
  set local role postgres;
end;
$case6$;

select is(
  current_setting('gt.state_reps', true),
  '23514',
  'un objetivo de cero repeticiones lo frena la base, no la suerte'
);

-- ---------- caso 7: un peso negativo ----------
do $case7$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1,
                         'target_weight_min', -10)
    )
  ));
exception when others then
  perform set_config('gt.state_weight', sqlstate, true);
  set local role postgres;
end;
$case7$;

select is(
  current_setting('gt.state_weight', true),
  '23514',
  'un peso negativo tampoco: nadie levanta menos que nada'
);

-- ---------- caso 8: un payload que ya no trae objetivos ----------
do $case8$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-01',
    'sets', jsonb_build_array()
  ));
  set local role postgres;
end;
$case8$;

select is(
  (select count(*)::int from public.workout_exercise_targets
   where workout_id = (select workout_a from t_ctx)),
  0,
  'un payload sin objetivos los borra: el guardado reemplaza, y eso es lo que lo hace idempotente'
);

-- ---------- caso 9: borrar el workout se lleva sus objetivos ----------
do $case9$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_cascade,
    'date', '2026-03-02',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1, 'target_reps', 8)
    )
  ));
  set local role postgres;
end;
$case9$;

set local role postgres;

delete from public.workouts where id = (select workout_cascade from t_ctx);

select is(
  (select count(*)::int from public.workout_exercise_targets
   where workout_id = (select workout_cascade from t_ctx)),
  0,
  'borrar el entrenamiento se lleva sus objetivos: la cascada está puesta'
);

-- ---------- caso 10: B no puede apuntar una SERIE al custom de A ----------
-- La FK de `workout_sets.exercise_id` sólo exige que la fila exista: sin este guard, adivinar el
-- UUID del custom de otro alcanzaba para colgarle una serie propia, y con eso su dueño —ni el
-- administrador— podía borrar el ejercicio (el FK lo frenaba con 23503).
do $case10$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_b,
    'date', '2026-03-03',
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', c.set_b, 'exercise_id', c.custom_a, 'set_number', 1,
        'reps', 10, 'weight_kg', 40, 'is_warmup', false
      )
    )
  ));
exception when others then
  perform set_config('gt.err_set_foreign', sqlerrm, true);
  set local role postgres;
end;
$case10$;

select is(
  current_setting('gt.err_set_foreign', true),
  'Forbidden',
  'B no puede guardar una serie apuntando al ejercicio custom de A: la FK sola no alcanzaba'
);

-- ---------- caso 11: lo mismo con un OBJETIVO ----------
do $case11$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_b,
    'date', '2026-03-03',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.custom_a, 'position', 1, 'target_reps', 10)
    )
  ));
exception when others then
  perform set_config('gt.err_target_foreign', sqlerrm, true);
  set local role postgres;
end;
$case11$;

select is(
  current_setting('gt.err_target_foreign', true),
  'Forbidden',
  'tampoco puede apuntarle un objetivo al mismo custom ajeno'
);

-- ---------- caso 12: el custom PROPIO y el catálogo GLOBAL sí pasan ----------
-- El guard no puede ser un `created_by = v_user_id` a secas: el catálogo compartido tiene
-- `created_by IS NULL` y sigue siendo de todos. Este caso prueba los dos lados que deben pasar,
-- en series y en objetivos.
do $case12$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_b,
    'date', '2026-03-03',
    'title', 'Dia de B',
    'custom_exercises', jsonb_build_array(
      jsonb_build_object('id', c.custom_b, 'name', 'Remo con banda', 'muscle_group_id', null)
    ),
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', c.set_b, 'exercise_id', c.custom_b, 'set_number', 1,
        'reps', 10, 'weight_kg', 30, 'is_warmup', false
      ),
      jsonb_build_object(
        'exercise_id', c.press_banca, 'set_number', 2,
        'reps', 8, 'weight_kg', 50, 'is_warmup', false
      )
    ),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.custom_b, 'position', 1, 'target_reps', 12),
      jsonb_build_object('exercise_id', c.press_banca, 'position', 2, 'target_reps', 10)
    )
  ));
  set local role postgres;
end;
$case12$;

select is(
  (select count(*)::int from public.workout_sets
   where workout_id = (select workout_b from t_ctx)),
  2,
  'el custom propio de B y el ejercicio global guardan su serie: el guard no los bloquea'
);

select is(
  (select count(*)::int from public.workout_exercise_targets
   where workout_id = (select workout_b from t_ctx)),
  2,
  'y lo mismo en los objetivos: propio y global pasan'
);

-- ---------- caso 13: posición cero ----------
do $case13$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-03',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', 0, 'target_reps', 8)
    )
  ));
exception when others then
  perform set_config('gt.state_position_zero', sqlstate, true);
  set local role postgres;
end;
$case13$;

select is(
  current_setting('gt.state_position_zero', true),
  '23514',
  'la posición cero la frena la base: no es un lugar válido de la sesión'
);

-- ---------- caso 14: posición negativa ----------
do $case14$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-03-03',
    'sets', jsonb_build_array(),
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'position', -1, 'target_reps', 8)
    )
  ));
exception when others then
  perform set_config('gt.state_position_negative', sqlstate, true);
  set local role postgres;
end;
$case14$;

select is(
  current_setting('gt.state_position_negative', true),
  '23514',
  'y la negativa tampoco: la posición es un orden, no un desplazamiento'
);

select * from finish();
rollback;

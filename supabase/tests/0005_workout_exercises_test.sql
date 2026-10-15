-- =============================================
-- GymTracker · 0005_workout_exercises_test — la tarjeta como entidad
-- Corre con: npx supabase test db   (local)   ·   npx supabase test db --linked   (hosted)
--
-- Sucede a `0005_targets_test.sql`, que probaba `workout_exercise_targets`: esa tabla la absorbe
-- `0012` y deja de existir, porque el objetivo siempre fue de la tarjeta y la tabla era la única
-- que llevaba la posición.
--
-- Cubre 0012 y, por arrastre, lo que 0012 tiene que seguir sosteniendo: el guard de dueño del
-- ejercicio de `0011`, la RLS y la cascada de `0004`/`0009`, y el contrato de `exercise_progress`.
--
-- Las aserciones que más valen no son las del camino feliz:
--   · el mismo ejercicio en DOS tarjetas guarda DOS objetivos distintos y **cada serie queda colgada
--     de la suya**, que es exactamente lo que no se podía saber antes de esta migración;
--   · una tarjeta **sin series y sin objetivo** existe igual: es el caso que antes desaparecía;
--   · la **forma vieja del payload sigue entrando**, porque una escritura encolada offline antes del
--     deploy tiene esa forma y un RPC que sólo entendiera la nueva la haría fallar para siempre;
--   · el orden guardado es el del array, y en la forma vieja es el de la posición del objetivo;
--   · la guarda de consistencia serie ↔ tarjeta vive en el motor: se prueba con un INSERT directo,
--     no a través de la función, porque es el motor lo que tiene que sostenerla.
--
-- Impersonación con el patrón del resto de la suite: `set local role authenticated` +
-- `request.jwt.claims`, y las aserciones de vuelta como `postgres`. Todo termina en rollback, así
-- que no queda nada en la base contra la que se corra.
-- =============================================

begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-000000000001', 'pgtap-cards-a@example.test'),
  ('00000000-0000-4000-b000-000000000002', 'pgtap-cards-b@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-b000-000000000001'::uuid as user_a,
  '00000000-0000-4000-b000-000000000002'::uuid as user_b,
  '11111111-1111-4111-8111-111111111111'::uuid as workout_a,
  '22222222-2222-4222-8222-222222222222'::uuid as workout_legacy,
  '33333333-3333-4333-8333-333333333333'::uuid as workout_ordered,
  '44444444-4444-4444-8444-444444444444'::uuid as workout_cascade,
  '55555555-5555-4555-8555-555555555555'::uuid as workout_b,
  '66666666-6666-4666-8666-666666666666'::uuid as custom_a,
  'a0000000-0000-4000-8000-000000000001'::uuid as set_a1,
  'a0000000-0000-4000-8000-000000000002'::uuid as set_a2,
  'a0000000-0000-4000-8000-000000000003'::uuid as set_a3,
  'a0000000-0000-4000-8000-000000000004'::uuid as set_legacy_press,
  'a0000000-0000-4000-8000-000000000005'::uuid as set_legacy_squat,
  'a0000000-0000-4000-8000-000000000006'::uuid as set_ordered_press,
  'a0000000-0000-4000-8000-000000000007'::uuid as set_ordered_squat,
  'a0000000-0000-4000-8000-000000000008'::uuid as set_cascade,
  (select id from public.exercises where name = 'Press Banca' and is_custom = false) as press_banca,
  (select id from public.exercises where name = 'Sentadilla' and is_custom = false) as sentadilla;

-- =============================================
-- La forma nueva: tarjetas con sus series adentro
-- =============================================
do $case1$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-05-01',
    'title', 'Dia de empuje',
    -- El custom de A tiene que EXISTIR para que el caso 9 pruebe lo que dice probar. Si no existe, el
    -- FK de `exercise_id` frena antes que el guard y la aserción pasa por el motivo equivocado: la
    -- encontró la suite en su primera corrida, esperando `Forbidden` y recibiendo un 23503.
    'custom_exercises', jsonb_build_array(
      jsonb_build_object('id', c.custom_a, 'name', 'Press con banda', 'muscle_group_id', null)
    ),
    'exercises', jsonb_build_array(
      jsonb_build_object(
        'exercise_id', c.press_banca,
        'target_reps', 8, 'target_weight_min', 60, 'target_weight_max', 80,
        'sets', jsonb_build_array(
          jsonb_build_object('id', c.set_a1, 'set_number', 1, 'reps', 10, 'weight_kg', 40, 'is_warmup', false),
          jsonb_build_object('id', c.set_a2, 'set_number', 2, 'reps', 8, 'weight_kg', 60, 'is_warmup', false)
        )
      ),
      -- La MISMA prensa otra vez, en la segunda tarjeta, con otro objetivo y su propia serie. Es el
      -- caso que la clave tiene que soportar: el lugar identifica a la tarjeta, no el ejercicio.
      jsonb_build_object(
        'exercise_id', c.press_banca,
        'target_reps', 5, 'target_weight_min', 90, 'target_weight_max', 100,
        'sets', jsonb_build_array(
          jsonb_build_object('id', c.set_a3, 'set_number', 1, 'reps', 5, 'weight_kg', 100, 'is_warmup', false)
        )
      ),
      -- Y una tarjeta SIN series y SIN objetivo: la que antes no tenía dónde estar y desaparecía.
      jsonb_build_object('exercise_id', c.sentadilla)
    )
  ));
  set local role postgres;
end;
$case1$;

select is(
  (select count(*)::int from public.workout_exercises
   where workout_id = (select workout_a from t_ctx)),
  3,
  'se guardan las tres tarjetas, incluida la que no tiene ni series ni objetivo'
);

select is(
  (select count(*)::int from public.workout_exercises
   where workout_id = (select workout_a from t_ctx) and exercise_id = (select press_banca from t_ctx)),
  2,
  'el mismo ejercicio dos veces son DOS tarjetas, y no una pisada por la otra'
);

select is(
  (select array_agg(exercise_id::text order by position) from public.workout_exercises
   where workout_id = (select workout_a from t_ctx)),
  array[
    (select press_banca::text from t_ctx),
    (select press_banca::text from t_ctx),
    (select sentadilla::text from t_ctx)
  ],
  'el orden del array es el orden que se guarda, y la tarjeta vacía conserva su lugar'
);

select ok(
  (select target_reps = 8 and target_weight_min = 60 and target_weight_max = 80
   from public.workout_exercises
   where workout_id = (select workout_a from t_ctx) and position = 1),
  'la primera tarjeta conserva su objetivo'
);

select ok(
  (select target_reps = 5 and target_weight_min = 90 and target_weight_max = 100
   from public.workout_exercises
   where workout_id = (select workout_a from t_ctx) and position = 2),
  'y la segunda el suyo: la segunda tarjeta del MISMO ejercicio no pisó a la primera'
);

select is(
  (select count(*)::int
   from public.workout_sets s
   join public.workout_exercises c on c.id = s.workout_exercise_id
   where s.workout_id = (select workout_a from t_ctx) and c.position = 1),
  2,
  'las dos series de la primera tarjeta cuelgan de ELLA'
);

select is(
  (select count(*)::int
   from public.workout_sets s
   join public.workout_exercises c on c.id = s.workout_exercise_id
   where s.workout_id = (select workout_a from t_ctx) and c.position = 2),
  1,
  'y la de la segunda, de la segunda: las series dejan de agruparse a ojo'
);

select is(
  (select count(*)::int from public.workout_sets
   where workout_id = (select workout_a from t_ctx) and workout_exercise_id is null),
  0,
  'ninguna serie queda sin tarjeta'
);

select ok(
  (select target_reps is null and target_weight_min is null and target_weight_max is null
   from public.workout_exercises
   where workout_id = (select workout_a from t_ctx) and position = 3),
  'una tarjeta sin objetivo guarda null, nunca cero'
);

-- =============================================
-- La forma vieja del payload, que sigue entrando
-- =============================================
do $case2$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_legacy,
    'date', '2026-05-02',
    'sets', jsonb_build_array(
      jsonb_build_object('id', c.set_legacy_squat, 'exercise_id', c.sentadilla, 'set_number', 1,
                         'reps', 8, 'weight_kg', 40, 'is_warmup', false),
      jsonb_build_object('id', c.set_legacy_press, 'exercise_id', c.press_banca, 'set_number', 1,
                         'reps', 10, 'weight_kg', 50, 'is_warmup', false)
    ),
    -- La posición del objetivo es la única señal de orden que tiene la forma vieja, así que ordena.
    'exercise_targets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.sentadilla, 'position', 2, 'target_reps', 8),
      jsonb_build_object('exercise_id', c.press_banca, 'position', 1, 'target_reps', 10)
    )
  ));
  set local role postgres;
end;
$case2$;

select is(
  (select count(*)::int from public.workout_exercises
   where workout_id = (select workout_legacy from t_ctx)),
  2,
  'un payload de la forma vieja sigue guardando sus tarjetas: la cola encolada antes del deploy no se rompe'
);

select is(
  (select exercise_id from public.workout_exercises
   where workout_id = (select workout_legacy from t_ctx) and position = 1),
  (select press_banca from t_ctx),
  'y las ordena por la posición del objetivo: press iba en la primera'
);

select is(
  (select target_reps from public.workout_exercises
   where workout_id = (select workout_legacy from t_ctx) and position = 1),
  10,
  'el objetivo del payload viejo llega a la tarjeta, que es donde ahora vive'
);

select is(
  (select count(*)::int
   from public.workout_sets s
   join public.workout_exercises c on c.id = s.workout_exercise_id
   where s.id = (select set_legacy_squat from t_ctx) and c.exercise_id = (select sentadilla from t_ctx)),
  1,
  'y cada serie de la forma vieja queda atribuida a SU tarjeta'
);

-- ---------- sin objetivos, el orden es determinista ----------
do $case3$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_ordered,
    'date', '2026-05-03',
    'sets', jsonb_build_array(
      jsonb_build_object('id', c.set_ordered_squat, 'exercise_id', c.sentadilla, 'set_number', 2,
                         'reps', 8, 'weight_kg', 40, 'is_warmup', false),
      jsonb_build_object('id', c.set_ordered_press, 'exercise_id', c.press_banca, 'set_number', 1,
                         'reps', 10, 'weight_kg', 50, 'is_warmup', false)
    )
  ));
  set local role postgres;
end;
$case3$;

select is(
  (select exercise_id from public.workout_exercises
   where workout_id = (select workout_ordered from t_ctx) and position = 1),
  (select press_banca from t_ctx),
  'sin objetivos el orden se reconstruye de forma determinista: primero el menor set_number'
);

-- =============================================
-- Idempotencia: el reintento reemplaza
-- =============================================
do $case4$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-05-01',
    'title', 'Dia de empuje',
    'exercises', jsonb_build_array(
      jsonb_build_object(
        'exercise_id', c.press_banca,
        'target_reps', 8, 'target_weight_min', 60, 'target_weight_max', 80,
        'sets', jsonb_build_array(
          jsonb_build_object('id', c.set_a1, 'set_number', 1, 'reps', 10, 'weight_kg', 40, 'is_warmup', false),
          jsonb_build_object('id', c.set_a2, 'set_number', 2, 'reps', 8, 'weight_kg', 60, 'is_warmup', false)
        )
      ),
      jsonb_build_object(
        'exercise_id', c.press_banca,
        'target_reps', 5, 'target_weight_min', 90, 'target_weight_max', 100,
        'sets', jsonb_build_array(
          jsonb_build_object('id', c.set_a3, 'set_number', 1, 'reps', 5, 'weight_kg', 100, 'is_warmup', false)
        )
      ),
      jsonb_build_object('exercise_id', c.sentadilla)
    )
  ));
  set local role postgres;
end;
$case4$;

select is(
  (select count(*)::int from public.workout_exercises
   where workout_id = (select workout_a from t_ctx)),
  3,
  'un reintento de la cola con el mismo payload no duplica las tarjetas'
);

select is(
  (select count(*)::int from public.workout_sets
   where workout_id = (select workout_a from t_ctx)),
  3,
  'ni las series: el guardado reemplaza, que es lo que lo hace idempotente'
);

-- =============================================
-- La guarda de consistencia, por INSERT directo y no por la función
-- =============================================
-- Es el motor el que tiene que sostenerla: si viviera en `save_workout`, cualquier otro camino de
-- escritura —hoy no hay ninguno, mañana sí— la esquivaría.
do $case5$
declare
  c record;
  v_card uuid;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  select id into v_card from public.workout_exercises
  where workout_id = c.workout_a and position = 1;

  insert into public.workout_sets (
    workout_id, user_id, exercise_id, workout_exercise_id, set_number, reps, weight_kg
  ) values (
    c.workout_a, c.user_a, c.sentadilla, v_card, 9, 5, 50
  );
exception when others then
  perform set_config('gt.err_card_exercise', sqlerrm, true);
  set local role postgres;
end;
$case5$;

select is(
  current_setting('gt.err_card_exercise', true),
  'Set exercise does not match its workout exercise',
  'una serie no puede declarar un ejercicio distinto del de su tarjeta, ni por INSERT directo'
);

do $case6$
declare
  c record;
  v_card uuid;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  select id into v_card from public.workout_exercises
  where workout_id = c.workout_a and position = 1;

  -- La tarjeta es de `workout_a` y la serie dice ser de `workout_legacy`. Los dos son de A, así que
  -- el FK de dueño pasa; lo que tiene que frenarlo es la guarda.
  insert into public.workout_sets (
    workout_id, user_id, exercise_id, workout_exercise_id, set_number, reps, weight_kg
  ) values (
    c.workout_legacy, c.user_a, c.press_banca, v_card, 9, 5, 50
  );
exception when others then
  perform set_config('gt.err_card_workout', sqlerrm, true);
  set local role postgres;
end;
$case6$;

select is(
  current_setting('gt.err_card_workout', true),
  'Set and workout exercise belong to different workouts',
  'ni colgar una serie de la tarjeta de otra sesión'
);

-- =============================================
-- Las restricciones de la tarjeta
-- =============================================
do $case7$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  insert into public.workout_exercises (workout_id, user_id, exercise_id, position)
  values (c.workout_legacy, c.user_a, c.press_banca, 0);
exception when others then
  perform set_config('gt.state_position_zero', sqlstate, true);
  set local role postgres;
end;
$case7$;

select is(
  current_setting('gt.state_position_zero', true),
  '23514',
  'la posición cero la frena la base: el lugar de una tarjeta empieza en uno'
);

do $case8$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  insert into public.workout_exercises (workout_id, user_id, exercise_id, position)
  values (c.workout_legacy, c.user_a, c.sentadilla, 1);
exception when others then
  perform set_config('gt.state_position_taken', sqlstate, true);
  set local role postgres;
end;
$case8$;

select is(
  current_setting('gt.state_position_taken', true),
  '23505',
  'y dos tarjetas no pueden ocupar el mismo lugar en una sesión'
);

-- =============================================
-- El guard de dueño del ejercicio, ahora por tarjeta (0011)
-- =============================================
-- La guarda tiene dos lados, y los dos se ejercitan: el catálogo global (`created_by IS NULL`) pasa
-- en el caso 1, y el custom AJENO se rechaza acá. El custom propio lo cubre `0004`, que guarda un
-- entrenamiento con un ejercicio inventado por el mismo usuario.
do $case9$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_b,
    'date', '2026-05-04',
    'exercises', jsonb_build_array(jsonb_build_object('exercise_id', c.custom_a))
  ));
exception when others then
  perform set_config('gt.err_card_foreign', sqlerrm, true);
  set local role postgres;
end;
$case9$;

select is(
  current_setting('gt.err_card_foreign', true),
  'Forbidden',
  'B no puede armar una tarjeta con el ejercicio custom de A: la FK sola no alcanzaba'
);

-- =============================================
-- RLS: B no ve las tarjetas de A
-- =============================================
do $case10$
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
$case10$;

select is(
  (select count(*)::int from public.workout_exercises),
  0,
  'B no ve ninguna tarjeta de A: la policy de lectura funciona'
);

-- =============================================
-- B no puede escribir sobre el workout de A
-- =============================================
do $case11$
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
    'date', '2026-05-01',
    'exercises', jsonb_build_array(jsonb_build_object('exercise_id', c.press_banca))
  ));
exception when others then
  perform set_config('gt.err_overwrite', sqlerrm, true);
  set local role postgres;
end;
$case11$;

select is(
  current_setting('gt.err_overwrite', true),
  'Forbidden',
  'adivinar el UUID de un workout ajeno no alcanza para escribirle tarjetas'
);

-- =============================================
-- La cascada: borrar la sesión se lleva sus tarjetas Y sus series
-- =============================================
do $case12$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', c.workout_cascade,
    'date', '2026-05-05',
    'exercises', jsonb_build_array(
      jsonb_build_object(
        'exercise_id', c.press_banca,
        'sets', jsonb_build_array(
          jsonb_build_object('id', c.set_cascade, 'set_number', 1, 'reps', 8, 'weight_kg', 45, 'is_warmup', false)
        )
      )
    )
  ));
  set local role postgres;
end;
$case12$;

set local role postgres;

delete from public.workouts where id = (select workout_cascade from t_ctx);

select is(
  (select count(*)::int from public.workout_exercises
   where workout_id = (select workout_cascade from t_ctx)),
  0,
  'borrar el entrenamiento se lleva sus tarjetas: la cascada está puesta'
);

select is(
  (select count(*)::int from public.workout_sets
   where workout_id = (select workout_cascade from t_ctx)),
  0,
  'y sus series, con o sin la cascada del FK de la tarjeta'
);

-- =============================================
-- El contrato de `exercise_progress` no cambió
-- =============================================
-- Esta es la aserción que justifica que `workout_sets.exercise_id` siga estando: la función agrega
-- por esa columna y no por la tarjeta, y su suite es el contrato del gráfico.
select ok(
  (select sum(total_sets) > 0
   from public.exercise_progress((select press_banca from t_ctx))),
  'exercise_progress sigue agregando por exercise_id sobre workout_sets: la columna denormalizada se queda'
);

-- =============================================
-- `anon` sigue afuera, también de la tabla nueva
-- =============================================
select ok(
  not has_table_privilege('anon', 'public.workout_exercises', 'SELECT'),
  'anon NO puede SELECT workout_exercises (deliberado: SPA privada tras login)'
);

select * from finish();
rollback;

-- =============================================
-- GymTracker · 0004_custom_exercises_test — el alta de ejercicios propios
-- Corre con: npx supabase test db --linked
--
-- Cubre el hueco que dejaba 0002: `save_workout` insertaba las series pero nunca
-- la fila del ejercicio custom, así que `workout_sets.exercise_id` violaba la FK y
-- **guardar un entrenamiento con un ejercicio propio era imposible**.
--
-- El camino de seguridad es el que importa acá. La función es SECURITY DEFINER y
-- Postgres no aplica RLS al dueño de la tabla, así que la policy `insert own
-- custom` de 0001 no protege este INSERT: el único guard es el de la función. Por
-- eso las aserciones que más valen son las de B intentando reclamar el custom de A
-- y la de un id del catálogo global.
--
-- Impersonación con el patrón del resto de la suite: `set local role authenticated`
-- + `request.jwt.claims`, y las aserciones de vuelta como `postgres`. Todo en una
-- transacción que termina en rollback, así que no queda nada en el proyecto hosted.
-- =============================================
begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'pgtap-a@example.test'),
  ('00000000-0000-4000-a000-000000000002', 'pgtap-b@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-a000-000000000001'::uuid as user_a,
  '00000000-0000-4000-a000-000000000002'::uuid as user_b,
  '33333333-3333-4333-8333-333333333333'::uuid as custom_a,
  '44444444-4444-4444-8444-444444444444'::uuid as workout_a,
  '55555555-5555-4555-8555-555555555555'::uuid as set_a,
  (select id from public.exercises where name = 'Press Banca' and is_custom = false) as press_banca;

-- ---------- caso 1: A guarda un workout con un ejercicio propio ----------
-- Con la función de 0002 esto explota con la violación de FK: es el defecto.
do $case1$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  v := public.save_workout(jsonb_build_object(
    'id', c.workout_a,
    'date', '2026-02-01',
    'title', 'Dia con banda',
    'custom_exercises', jsonb_build_array(
      jsonb_build_object('id', c.custom_a, 'name', 'Press Banca con banda', 'muscle_group_id', null)
    ),
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', c.set_a,
        'exercise_id', c.custom_a,
        'set_number', 1,
        'reps', 12,
        'weight_kg', 40,
        'is_warmup', false
      )
    )
  ));

  set local role postgres;
  perform set_config('gt.workout', v->>'workout_id', true);
end
$case1$;

select is(
  (select count(*)::int from public.exercises where id = (select custom_a from t_ctx)),
  1,
  'save_workout crea la fila del ejercicio custom'
);

select is(
  (select name from public.exercises where id = (select custom_a from t_ctx)),
  'Press Banca con banda',
  'con el nombre que traía el payload'
);

select is(
  (select created_by from public.exercises where id = (select custom_a from t_ctx)),
  (select user_a from t_ctx),
  'y con el dueño que lo creó'
);

select is(
  (select is_custom from public.exercises where id = (select custom_a from t_ctx)),
  true,
  'marcado como custom'
);

select is(
  (select count(*)::int from public.workout_sets
   where exercise_id = (select custom_a from t_ctx)),
  1,
  'la serie que lo referencia se guardó: la FK era justo lo que fallaba'
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
    'date', '2026-02-01',
    'title', 'Dia con banda',
    'custom_exercises', jsonb_build_array(
      jsonb_build_object('id', c.custom_a, 'name', 'Press Banca con banda', 'muscle_group_id', null)
    ),
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', c.set_a,
        'exercise_id', c.custom_a,
        'set_number', 1,
        'reps', 12,
        'weight_kg', 40,
        'is_warmup', false
      )
    )
  ));

  set local role postgres;
end
$case2$;

select is(
  (select count(*)::int from public.exercises where id = (select custom_a from t_ctx)),
  1,
  'un reintento no duplica el ejercicio custom'
);

select is(
  (select count(*)::int from public.workout_sets where exercise_id = (select custom_a from t_ctx)),
  1,
  'ni duplica la serie que lo usa'
);

-- ---------- caso 3: B intenta reclamar el custom de A ----------
do $case3$
declare
  c record;
  v_err text;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  begin
    perform public.save_workout(jsonb_build_object(
      'id', '66666666-6666-4666-8666-666666666666',
      'date', '2026-02-02',
      'custom_exercises', jsonb_build_array(
        jsonb_build_object('id', c.custom_a, 'name', 'Secuestrado por B')
      ),
      'sets', '[]'::jsonb
    ));
    v_err := 'sin error';
  exception when others then
    v_err := sqlerrm;
  end;

  set local role postgres;
  perform set_config('gt.err3', v_err, true);
end
$case3$;

select is(
  current_setting('gt.err3'),
  'Forbidden',
  'B no puede reclamar el ejercicio custom de A: la función es el único guard'
);

select is(
  (select name from public.exercises where id = (select custom_a from t_ctx)),
  'Press Banca con banda',
  'y el de A queda intacto'
);

-- ---------- caso 4: reclamar un id del catálogo global ----------
do $case4$
declare
  c record;
  v_err text;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    perform public.save_workout(jsonb_build_object(
      'id', '77777777-7777-4777-8777-777777777777',
      'date', '2026-02-03',
      'custom_exercises', jsonb_build_array(
        jsonb_build_object('id', c.press_banca, 'name', 'Press Banca (mío)')
      ),
      'sets', '[]'::jsonb
    ));
    v_err := 'sin error';
  exception when others then
    v_err := sqlerrm;
  end;

  set local role postgres;
  perform set_config('gt.err4', v_err, true);
end
$case4$;

select is(
  current_setting('gt.err4'),
  'Forbidden',
  'un id del catálogo global tampoco se puede reclamar como propio'
);

-- ---------- caso 5: nombre vacío ----------
do $case5$
declare
  c record;
  v_err text;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    perform public.save_workout(jsonb_build_object(
      'id', '88888888-8888-4888-8888-888888888888',
      'date', '2026-02-04',
      'custom_exercises', jsonb_build_array(
        jsonb_build_object('id', '99999999-9999-4999-8999-999999999999', 'name', '   ')
      ),
      'sets', '[]'::jsonb
    ));
    v_err := 'sin error';
  exception when others then
    v_err := sqlerrm;
  end;

  set local role postgres;
  perform set_config('gt.err5', v_err, true);
end
$case5$;

select is(
  current_setting('gt.err5'),
  'Custom exercise name is required',
  'un nombre vacío se rechaza con un mensaje que se le puede mostrar a alguien'
);

select * from finish();
rollback;

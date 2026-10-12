-- =============================================
-- GymTracker · 0002_save_workout_test — la RPC de guardado
-- Corre con: npx supabase test db --linked
--
-- `save_workout` es SECURITY DEFINER y decide todo por `auth.uid()`, así que hay
-- que impersonar: `set local role authenticated` + los claims del usuario. Las
-- aserciones de pgTAP, en cambio, corren como `postgres`, porque `authenticated`
-- no puede leer las tablas (por diseño) y no vale la pena darle USAGE sobre el
-- schema `extensions` solo para poder testear.
--
-- De ahí el patrón de todos los casos: un bloque DO impersona, llama a la RPC y
-- guarda el resultado o el mensaje de error en GUCs de transacción; recién
-- después se asserta, ya de vuelta como postgres. Todo el archivo vive en una
-- transacción que termina en rollback: los usuarios de prueba no quedan en la
-- base ni ensucian el proyecto hosted.
-- =============================================
begin;

set local role postgres;
set local search_path = public, extensions;

select plan(20);

-- ---------- fixtures ----------
-- Dos usuarios reales: insertar en `auth.users` dispara `handle_new_user`, así
-- que los perfiles se crean por el mismo camino que un alta real, no a mano.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'pgtap-a@example.test'),
  ('00000000-0000-4000-a000-000000000002', 'pgtap-b@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-a000-000000000001'::uuid as user_a,
  '00000000-0000-4000-a000-000000000002'::uuid as user_b,
  (select id from public.exercises where name = 'Press Banca' and is_custom = false) as press_banca,
  (select id from public.exercises where name = 'Sentadilla' and is_custom = false) as sentadilla;

-- ---------- caso 1: guardado nuevo, PR calculado con Epley ----------
do $case1$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;
  v := public.save_workout(jsonb_build_object(
    'id', '11111111-1111-4111-8111-111111111111',
    'date', '2026-01-10',
    'title', 'Dia A',
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'exercise_id', c.press_banca,
        'set_number', 1, 'reps', 5, 'weight_kg', 100, 'is_warmup', false
      )
    )
  ));
  set local role postgres;
  perform set_config('gt.r1', v::text, true);
end
$case1$;

select is(
  current_setting('gt.r1')::jsonb->>'workout_id',
  '11111111-1111-4111-8111-111111111111',
  'save_workout devuelve el workout_id del payload'
);
select is(
  (select count(*)::int from public.workouts
    where id = '11111111-1111-4111-8111-111111111111'
      and user_id = '00000000-0000-4000-a000-000000000001'),
  1,
  'crea el workout a nombre del usuario autenticado'
);
select is(
  (select count(*)::int from public.workout_sets
    where workout_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'guarda la serie que vino en el payload'
);
select is(
  (select best_1rm from public.personal_records
    where user_id = '00000000-0000-4000-a000-000000000001'
      and exercise_id = (select press_banca from t_ctx)),
  116.67,
  'Epley: 100 kg x 5 reps -> 116.67 (100 * (1 + 5/30))'
);
select is(
  jsonb_array_length(current_setting('gt.r1')::jsonb->'new_prs'),
  1,
  'reporta el PR nuevo en la respuesta'
);

-- ---------- caso 2: reintento con los mismos UUID ----------
-- Es el caso real de la cola offline: el mismo payload se reenvía y no puede
-- duplicar nada.
do $case2$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;
  v := public.save_workout(jsonb_build_object(
    'id', '11111111-1111-4111-8111-111111111111',
    'date', '2026-01-10',
    'title', 'Dia A',
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'exercise_id', c.press_banca,
        'set_number', 1, 'reps', 5, 'weight_kg', 100, 'is_warmup', false
      )
    )
  ));
  set local role postgres;
  perform set_config('gt.r2', v::text, true);
end
$case2$;

select is(
  (select count(*)::int from public.workout_sets
    where workout_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'reintento: la serie no se duplica'
);
select is(
  (select count(*)::int from public.workouts
    where user_id = '00000000-0000-4000-a000-000000000001'),
  1,
  'reintento: sigue habiendo un solo workout'
);
select is(
  jsonb_array_length(current_setting('gt.r2')::jsonb->'new_prs'),
  0,
  'reintento: no vuelve a reportar el PR ya logrado'
);

-- ---------- caso 3: el mismo workout con otra lista de series ----------
-- `save_workout` reemplaza el set completo de series, no hace merge.
do $case3$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;
  v := public.save_workout(jsonb_build_object(
    'id', '11111111-1111-4111-8111-111111111111',
    'date', '2026-01-10',
    'title', 'Dia A',
    'sets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'set_number', 1, 'reps', 3, 'weight_kg', 80, 'is_warmup', false),
      jsonb_build_object('exercise_id', c.press_banca, 'set_number', 2, 'reps', 3, 'weight_kg', 80, 'is_warmup', false)
    )
  ));
  set local role postgres;
end
$case3$;

select is(
  (select count(*)::int from public.workout_sets
    where workout_id = '11111111-1111-4111-8111-111111111111'),
  2,
  'reemplazo: quedan las 2 series nuevas'
);
select is(
  (select count(*)::int from public.workout_sets
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'reemplazo: la serie vieja ya no esta (no hay merge)'
);

-- ---------- caso 4: un warmup pesado no cuenta como PR ----------
do $case4$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;
  v := public.save_workout(jsonb_build_object(
    'id', '22222222-2222-4222-8222-222222222222',
    'date', '2026-01-11',
    'sets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.sentadilla, 'set_number', 1, 'reps', 5, 'weight_kg', 200, 'is_warmup', true)
    )
  ));
  set local role postgres;
  perform set_config('gt.r4', v::text, true);
end
$case4$;

select is(
  (select count(*)::int from public.workout_sets
    where workout_id = '22222222-2222-4222-8222-222222222222'),
  1,
  'el warmup igual queda guardado en el historial'
);
select is(
  (select count(*)::int from public.personal_records
    where user_id = '00000000-0000-4000-a000-000000000001'
      and exercise_id = (select sentadilla from t_ctx)),
  0,
  'un warmup de 200 kg x 5 no crea PR'
);
select is(
  jsonb_array_length(current_setting('gt.r4')::jsonb->'new_prs'),
  0,
  'un warmup pesado no se reporta como PR'
);

-- ---------- caso 5: una serie mas liviana no baja el PR (A4) ----------
do $case5$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;
  v := public.save_workout(jsonb_build_object(
    'id', '33333333-3333-4333-8333-333333333333',
    'date', '2026-01-12',
    'sets', jsonb_build_array(
      jsonb_build_object('exercise_id', c.press_banca, 'set_number', 1, 'reps', 5, 'weight_kg', 50, 'is_warmup', false)
    )
  ));
  set local role postgres;
  perform set_config('gt.r5', v::text, true);
end
$case5$;

select is(
  (select best_1rm from public.personal_records
    where user_id = '00000000-0000-4000-a000-000000000001'
      and exercise_id = (select press_banca from t_ctx)),
  116.67,
  'un entrenamiento mas liviano no baja la mejor marca (A4)'
);
select is(
  jsonb_array_length(current_setting('gt.r5')::jsonb->'new_prs'),
  0,
  'sin PR nuevo: la marca no mejoro'
);

-- ---------- caso 6: ownership, no se puede pisar el workout de otro ----------
do $case6$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;
  begin
    perform public.save_workout(jsonb_build_object(
      'id', '11111111-1111-4111-8111-111111111111',
      'title', 'Robado',
      'sets', '[]'::jsonb
    ));
    perform set_config('gt.err6', 'NO-ERROR', true);
  exception when others then
    perform set_config('gt.err6', sqlerrm, true);
  end;
  set local role postgres;
end
$case6$;

select is(
  current_setting('gt.err6'),
  'Forbidden',
  'rechaza guardar sobre el workout de otro usuario'
);
select is(
  (select count(*)::int from public.workout_sets
    where workout_id = '11111111-1111-4111-8111-111111111111'),
  2,
  'el intento rechazado no borra las series del workout ajeno'
);
select is(
  (select title from public.workouts
    where id = '11111111-1111-4111-8111-111111111111'),
  'Dia A',
  'el intento rechazado no modifica el workout ajeno'
);

-- ---------- caso 7: sin claims no hay usuario ----------
do $case7$
begin
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  begin
    perform public.save_workout(jsonb_build_object('id', '44444444-4444-4444-8444-444444444444', 'sets', '[]'::jsonb));
    perform set_config('gt.err7', 'NO-ERROR', true);
  exception when others then
    perform set_config('gt.err7', sqlerrm, true);
  end;
  set local role postgres;
end
$case7$;

select is(
  current_setting('gt.err7'),
  'Not authenticated',
  'sin claims rechaza: auth.uid() nulo'
);

-- ---------- caso 8: RLS, con un JWT real ----------
-- Es el harness que pedia el hallazgo A6: impersonar `authenticated` con claims
-- en vez de usar `service_role`, que bypassea RLS y por eso no prueba nada.
do $case8$
declare
  c record;
  v int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;
  select count(*) into v from public.workouts;
  set local role postgres;
  perform set_config('gt.rls8', v::text, true);
end
$case8$;

select is(
  current_setting('gt.rls8')::int,
  0,
  'RLS: el usuario B no ve los workouts del usuario A'
);

select * from finish();

rollback;

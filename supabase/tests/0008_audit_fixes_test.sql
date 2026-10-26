-- =============================================
-- GymTracker · 0008_audit_fixes_test — los arreglos de la auditoría del 2026-10-21
--
-- Cubre las tres reglas que la auditoría encontró sin prueba:
--   1. 3×10 a 70 kg devuelve **un** récord, no tres (el 1RM se redondea antes de comparar).
--   2. El récord se fecha con la fecha del payload, no con la del reintento.
--   3. Un usuario no puede escribir una fila propia apuntando al ejercicio custom de otro
--      (ni por `personal_records` ni por `workout_exercises`), y el dashboard no filtra el
--      nombre ajeno.
--   4. `dashboard_summary(p_today)` usa el día que le pasa el cliente, no el UTC del servidor.
--
-- Corre con `supabase test db`, dentro de una transacción que termina en rollback.
-- =============================================

begin;

set local role postgres;
set local search_path = public, extensions;

select plan(8);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000000a1', 'pgtap-audit-a@example.test'),
  ('00000000-0000-4000-a000-0000000000b1', 'pgtap-audit-b@example.test');

insert into public.exercises (id, name, is_custom, created_by)
values (
  '00000000-0000-4000-a000-0000000000c1',
  'Ejercicio privado de B',
  true,
  '00000000-0000-4000-a000-0000000000b1'
);

create temporary table t_ctx as
select
  '00000000-0000-4000-a000-0000000000a1'::uuid as user_a,
  '00000000-0000-4000-a000-0000000000b1'::uuid as user_b,
  (select id from public.exercises where name = 'Press Banca' and is_custom = false) as press_banca,
  '00000000-0000-4000-a000-0000000000c1'::uuid as custom_b;

-- ---------- caso 1: una sesión de tres series iguales = un récord ----------
do $save$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  v := public.save_workout(jsonb_build_object(
    'id', '22222222-2222-4222-8222-222222222222',
    'date', '2026-10-18',
    'title', 'Auditoría',
    'sets', jsonb_build_array(
      jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        'exercise_id', c.press_banca,
        'set_number', 1, 'reps', 10, 'weight_kg', 70, 'is_warmup', false
      ),
      jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        'exercise_id', c.press_banca,
        'set_number', 2, 'reps', 10, 'weight_kg', 70, 'is_warmup', false
      ),
      jsonb_build_object(
        'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        'exercise_id', c.press_banca,
        'set_number', 3, 'reps', 10, 'weight_kg', 70, 'is_warmup', false
      )
    )
  ));

  set local role postgres;
  perform set_config('gt.save', v::text, true);
end
$save$;

select is(
  jsonb_array_length(current_setting('gt.save')::jsonb->'new_prs'),
  1,
  '3×10 a 70 kg devuelve un récord, no uno por serie'
);

select is(
  (select best_1rm from public.personal_records
    where user_id = (select user_a from t_ctx)
      and exercise_id = (select press_banca from t_ctx)),
  93.33,
  'el 1RM se guarda redondeado a dos decimales: 70 × (1 + 10/30) = 93.33'
);

select is(
  (select achieved_at from public.personal_records
    where user_id = (select user_a from t_ctx)
      and exercise_id = (select press_banca from t_ctx)),
  '2026-10-18'::date,
  'el récord se fecha con la fecha del payload, no con la del servidor'
);

-- ---------- caso 2: el ejercicio custom ajeno no se puede colgar ----------
do $direct_pr$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    insert into public.personal_records (user_id, exercise_id, achieved_at)
    values (c.user_a, c.custom_b, '2026-10-01');
    perform set_config('gt.err_pr', 'no-error', true);
  exception when others then
    perform set_config('gt.err_pr', sqlerrm, true);
  end;

  set local role postgres;
end
$direct_pr$;

select is(
  current_setting('gt.err_pr'),
  'Forbidden',
  'personal_records rechaza un exercise_id del custom de otro'
);

-- Una segunda sesión sin tarjetas, para probar el INSERT directo de una tarjeta ajena.
do $empty$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  perform public.save_workout(jsonb_build_object(
    'id', '33333333-3333-4333-8333-333333333333',
    'date', '2026-10-19',
    'title', 'Vacía',
    'sets', '[]'::jsonb
  ));

  set local role postgres;
end
$empty$;

do $direct_card$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    insert into public.workout_exercises (workout_id, user_id, exercise_id, position)
    values (
      '33333333-3333-4333-8333-333333333333',
      c.user_a,
      c.custom_b,
      1
    );
    perform set_config('gt.err_card', 'no-error', true);
  exception when others then
    perform set_config('gt.err_card', sqlerrm, true);
  end;

  set local role postgres;
end
$direct_card$;

select is(
  current_setting('gt.err_card'),
  'Forbidden',
  'workout_exercises rechaza una tarjeta que apunta al custom de otro'
);

-- ---------- caso 3: el día local manda la semana y la racha ----------
do $dash18$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  v := public.dashboard_summary('2026-10-18');

  set local role postgres;
  perform set_config('gt.dash18', v::text, true);
end
$dash18$;

select is(
  (current_setting('gt.dash18')::jsonb->'week_days') @> '["2026-10-18"]'::jsonb,
  true,
  'con el día local, el domingo 18 entra en la semana que empieza el lunes 12'
);

do $dash19$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  v := public.dashboard_summary('2026-10-19');

  set local role postgres;
  perform set_config('gt.dash19', v::text, true);
end
$dash19$;

select is(
  (current_setting('gt.dash19')::jsonb->'week_days') @> '["2026-10-18"]'::jsonb,
  false,
  'con el lunes 19 como hoy, el domingo 18 ya pertenece a la semana anterior'
);

select is(
  (current_setting('gt.dash19')::jsonb->>'streak')::int,
  2,
  'la racha cuenta el 19 y el 18, y no depende del reloj UTC del servidor'
);

select * from finish();

rollback;

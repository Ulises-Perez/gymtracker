-- =============================================
-- GymTracker · 0007_dashboard_summary_test — el resumen de la cuenta
-- Corre con: npx supabase test db   (local)   ·   npx supabase test db --linked   (hosted)
--
-- `dashboard_summary()` es la lectura que pinta el Inicio, y hasta ahora nadie la había probado.
-- Lo que se cubre acá es lo que se rompió en silencio: el Inicio contaba los ejercicios de una
-- sesión mirando las SERIES, cuando desde 0012 los ejercicios de una sesión son las TARJETAS
-- (`workout_exercises`). Una sesión con un ejercicio y ninguna serie salía "0 ejercicios" en el
-- Inicio mientras su propio detalle listaba la tarjeta: dos pantallas de la misma app
-- contradiciéndose sobre la misma sesión.
--
-- Impersonación con el patrón del resto de la suite: `set local role authenticated` +
-- `request.jwt.claims`, el resultado guardado en un GUC de transacción y las aserciones de vuelta
-- como `postgres` (que es el único rol que puede leer las tablas para testear). Todo termina en
-- rollback, así que no queda nada en la base contra la que se corra.
-- =============================================

begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-c000-000000000001', 'pgtap-summary-a@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-c000-000000000001'::uuid as user_a,
  '77777777-7777-4777-8777-777777777777'::uuid as workout_con_series,
  '88888888-8888-4888-8888-888888888888'::uuid as workout_sin_series,
  '99999999-9999-4999-8999-999999999999'::uuid as workout_borrado,
  (select id from public.exercises where name = 'Press Banca' and is_custom = false) as press_banca;

-- Una sesión con una tarjeta y una serie.
insert into public.workouts (id, user_id, date, title)
values ('77777777-7777-4777-8777-777777777777', '00000000-0000-4000-c000-000000000001', '2026-10-01', 'Empuje');

insert into public.workout_exercises (id, workout_id, user_id, exercise_id, position)
values
  ('b0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', '00000000-0000-4000-c000-000000000001', (select press_banca from t_ctx), 1);

insert into public.workout_sets (id, workout_id, user_id, exercise_id, workout_exercise_id, set_number, reps, weight_kg)
values
  ('b1000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', '00000000-0000-4000-c000-000000000001', (select press_banca from t_ctx), 'b0000000-0000-4000-8000-000000000001', 1, 8, 60);

-- Una sesión con una tarjeta y NINGUNA serie: la tarjeta es real ("una tarjeta sin series es una
-- tarjeta real") y el Inicio la contaba como cero ejercicios.
insert into public.workouts (id, user_id, date, title)
values ('88888888-8888-4888-8888-888888888888', '00000000-0000-4000-c000-000000000001', '2026-10-02', 'Press sin series');

insert into public.workout_exercises (id, workout_id, user_id, exercise_id, position)
values
  ('b0000000-0000-4000-8000-000000000002', '88888888-8888-4888-8888-888888888888', '00000000-0000-4000-c000-000000000001', (select press_banca from t_ctx), 1);

-- Una sesión borrada: no puede ser la última ni contar.
insert into public.workouts (id, user_id, date, title, deleted_at)
values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-c000-000000000001', '2026-10-03', 'Borrada', now());

-- =============================================
-- El resumen de la cuenta
-- =============================================
do $case1$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  v := public.dashboard_summary();

  perform set_config('gt.r1', v::text, true);
  set local role postgres;
end
$case1$;

-- La última sesión es la más reciente, y la borrada no cuenta.
select is(
  (current_setting('gt.r1')::jsonb -> 'last_workout' ->> 'id'),
  (select workout_sin_series::text from t_ctx),
  'la última sesión es la más reciente que no está borrada'
);

-- Y los ejercicios se cuentan por TARJETA: una sesión con un ejercicio y ninguna serie tiene
-- un ejercicio, no cero.
select is(
  (current_setting('gt.r1')::jsonb -> 'last_workout' ->> 'exercise_count')::int,
  1,
  'la última sesión cuenta su tarjeta aunque no tenga series'
);

-- El total tampoco cuenta la sesión borrada.
select is(
  (current_setting('gt.r1')::jsonb ->> 'total_workouts')::int,
  2,
  'el total de sesiones no cuenta la borrada'
);

-- =============================================
-- La sesión con series se cuenta por su tarjeta también
-- =============================================
do $case2$
declare
  c record;
  v jsonb;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  -- Se borra la sesión sin series para que la última sea la que tiene series.
  update public.workouts set deleted_at = now() where id = c.workout_sin_series;

  v := public.dashboard_summary();

  perform set_config('gt.r2', v::text, true);
  set local role postgres;
end
$case2$;

select is(
  (current_setting('gt.r2')::jsonb -> 'last_workout' ->> 'id'),
  (select workout_con_series::text from t_ctx),
  'con la sesión sin series borrada, la última es la que tiene series'
);

select is(
  (current_setting('gt.r2')::jsonb -> 'last_workout' ->> 'exercise_count')::int,
  1,
  'una sesión con una tarjeta y una serie cuenta un ejercicio'
);

rollback;

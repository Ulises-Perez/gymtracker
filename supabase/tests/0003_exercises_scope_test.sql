-- =============================================
-- GymTracker · 0003_exercises_scope_test — quién ve qué en el catálogo
-- Corre con: npx supabase test db --linked
--
-- Cubre el hallazgo que la suite no miraba: `exercises` tenía la policy de lectura
-- en `USING (true)`, así que A leía los ejercicios custom de B. Las aserciones de
-- privilegio entre usuarios se hacen con el patrón de impersonación del resto de
-- la suite: `set local role authenticated` + los claims del usuario, y recién
-- después se asserta como `postgres` (que es el único que puede leer todo).
--
-- Todo vive en una transacción que termina en rollback, así que los usuarios y el
-- ejercicio de prueba no quedan en el proyecto hosted.
-- =============================================
begin;

set local role postgres;
set local search_path = public, extensions;

select plan(8);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'pgtap-a@example.test'),
  ('00000000-0000-4000-a000-000000000002', 'pgtap-b@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-a000-000000000001'::uuid as user_a,
  '00000000-0000-4000-a000-000000000002'::uuid as user_b;

-- A crea un ejercicio custom suyo, por el mismo camino que la app: la policy de
-- INSERT exige `is_custom = true` y `created_by = auth.uid()`.
do $create$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;
  insert into public.exercises (id, name, muscle_group_id, is_custom, created_by)
  values (
    '22222222-2222-4222-8222-222222222222',
    'Press Banca de A',
    null,
    true,
    c.user_a
  );
  set local role postgres;
end
$create$;

-- ---------- qué ve B ----------
do $b$
declare
  c record;
  v_ajeno int;
  v_global int;
  v_total int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  select count(*)::int into v_ajeno
  from public.exercises
  where is_custom = true and created_by = c.user_a;

  select count(*)::int into v_global
  from public.exercises
  where coalesce(is_custom, false) = false;

  select count(*)::int into v_total from public.exercises;

  set local role postgres;
  perform set_config('gt.b_ajeno', v_ajeno::text, true);
  perform set_config('gt.b_global', v_global::text, true);
  perform set_config('gt.b_total', v_total::text, true);
end
$b$;

-- ---------- qué ve A ----------
do $a$
declare
  c record;
  v_propio int;
  v_global int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  select count(*)::int into v_propio
  from public.exercises
  where is_custom = true and created_by = c.user_a;

  select count(*)::int into v_global
  from public.exercises
  where coalesce(is_custom, false) = false;

  set local role postgres;
  perform set_config('gt.a_propio', v_propio::text, true);
  perform set_config('gt.a_global', v_global::text, true);
end
$a$;

-- ---------- aserciones ----------
select is(
  current_setting('gt.b_ajeno')::int, 0,
  'B no ve el ejercicio custom de A'
);

select is(
  current_setting('gt.b_global')::int,
  (select count(*)::int from public.exercises where coalesce(is_custom, false) = false),
  'B ve el catálogo global completo'
);

-- La aserción fuerte: lo único que B ve es el catálogo global. Si mañana se
-- agrega otra policy permisiva, esto la delata.
select is(
  current_setting('gt.b_total')::int, current_setting('gt.b_global')::int,
  'lo único que B ve son filas del catálogo global'
);

select is(
  current_setting('gt.a_propio')::int, 1,
  'A sí ve su propio ejercicio custom'
);

select is(
  current_setting('gt.a_global')::int, current_setting('gt.b_global')::int,
  'A y B ven el mismo catálogo global'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'exercises' and policyname = 'read exercises'),
  1,
  'la policy de lectura sigue existiendo, y una sola vez'
);

select ok(
  (select qual from pg_policies
   where schemaname = 'public' and tablename = 'exercises' and policyname = 'read exercises')
  <> 'true',
  'la policy de lectura ya no es USING (true)'
);

-- Guarda contra el arreglo opuesto: que en lugar de recortar se haya ampliado
-- dándole lectura al rol anónimo.
select is(
  has_table_privilege('anon', 'public.exercises', 'SELECT'), false,
  'anon sigue sin poder leer exercises'
);

select * from finish();
rollback;

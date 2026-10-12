-- =============================================
-- GymTracker · 0001_schema_test — schema, seed y privilegios
-- Corre con: npx supabase test db --linked
--
-- Dos particularidades del harness contra un proyecto hosted, las dos
-- descubiertas ejecutando (no leyendo):
--
-- 1. pg_prove se conecta con `cli_login_postgres`, el rol temporal que crea el
--    CLI (contraseña que caduca a los 5 minutos). Es miembro de `postgres` con
--    INHERIT FALSE, así que hay que escalar explícitamente para leer datos como
--    owner: sin esto, toda lectura falla con `permission denied for table ...`.
--    El CLI hace esta misma escalada en sus propios queries; pg_prove no.
-- 2. pgTAP vive en el schema `extensions` y el search_path de la conexión es
--    `"$user", public`, así que hay que traerlo (el CLI ya lo deja instalado).
--
-- `create extension` es transaccional: el rollback final lo deshace y el test
-- no deja rastro en la base.
-- =============================================
begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

-- ---------- seed ----------
select is((select count(*)::int from public.muscle_groups), 10, 'seed: 10 grupos musculares');
select is(
  (select count(*)::int from public.exercises where is_custom = false),
  57,
  'seed: 57 ejercicios globales (los 48 originales + los 9 que faltaban por M5)'
);
select is(
  (
    select count(*)::int
    from public.muscle_groups g
    where not exists (select 1 from public.exercises e where e.muscle_group_id = g.id)
  ),
  0,
  'seed: ningun grupo muscular queda vacio (hallazgo M5)'
);
select is(
  (
    select g.name
    from public.exercises e
    join public.muscle_groups g on g.id = e.muscle_group_id
    where e.name = 'Hip Thrust' and e.is_custom = false
  ),
  'Glúteos',
  'seed: Hip Thrust vive bajo Glúteos, no bajo Piernas (hallazgo M5)'
);
select is(
  (select count(*)::int from public.exercises where name = 'Hip Thrust' and is_custom = false),
  1,
  'seed: Hip Thrust existe una sola vez, aunque el seed se haya corrido dos veces'
);

-- ---------- RLS habilitado en todas las tablas de usuario ----------
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles: RLS habilitado'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.workouts'::regclass),
  true,
  'workouts: RLS habilitado'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.workout_sets'::regclass),
  true,
  'workout_sets: RLS habilitado'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.exercises'::regclass),
  true,
  'exercises: RLS habilitado'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.personal_records'::regclass),
  true,
  'personal_records: RLS habilitado'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.body_measurements'::regclass),
  true,
  'body_measurements: RLS habilitado'
);

-- ---------- integridad de fila y soft delete (migraciones 0004 y 0006) ----------
-- `workout_sets.user_id` esta desnormalizado; el FK compuesto es lo que lo ata a
-- `workouts.user_id` en vez de dejarlo librado a la convencion (hallazgo A2).
-- Se afirma la FORMA del FK, no solo su nombre: un FK simple contra
-- `workouts(id)` volveria a dejar `user_id` libre, que es justo lo que A2
-- prohibe. (`fk_ok` de pgTAP no existe en la version instalada, 3.36.)
select ok(
  (
    select con.conkey = array[
             (select attnum from pg_attribute where attrelid = con.conrelid and attname = 'workout_id'),
             (select attnum from pg_attribute where attrelid = con.conrelid and attname = 'user_id')
           ]
       and con.confkey = array[
             (select attnum from pg_attribute where attrelid = con.confrelid and attname = 'id'),
             (select attnum from pg_attribute where attrelid = con.confrelid and attname = 'user_id')
           ]
    from pg_constraint con
    where con.conrelid = 'public.workout_sets'::regclass
      and con.conname = 'workout_sets_workout_owner_fkey'
  ),
  'workout_sets: FK compuesto (workout_id, user_id) -> workouts (id, user_id) (hallazgo A2)'
);
select has_column(
  'public',
  'body_measurements',
  'deleted_at',
  'body_measurements: tiene deleted_at, como el resto de las tablas (hallazgo M4)'
);
select has_index(
  'public',
  'body_measurements',
  'ux_body_measurements_live_date',
  'body_measurements: unicidad por dia solo entre filas vivas (M4 + soft delete)'
);
select has_index(
  'public',
  'exercises',
  'ux_exercises_global_name',
  'exercises: el catalogo global no admite duplicados por (grupo, nombre) (M5)'
);

-- ---------- GRANTs de tabla: el bug 42501 detectado contra la base hosted ----------
-- RLS filtra filas dentro de los privilegios del rol. Sin GRANT no hay acceso,
-- por más que exista la policy.
select ok(
  has_table_privilege('authenticated', 'public.workouts', 'SELECT'),
  'authenticated puede SELECT workouts'
);
select ok(
  has_table_privilege('authenticated', 'public.workout_sets', 'INSERT'),
  'authenticated puede INSERT workout_sets'
);
select ok(
  has_table_privilege('authenticated', 'public.exercises', 'INSERT'),
  'authenticated puede INSERT ejercicios custom'
);
select ok(
  not has_table_privilege('anon', 'public.workouts', 'SELECT'),
  'anon NO puede SELECT workouts (deliberado: SPA privada tras login)'
);

-- ---------- GRANTs de funcion: hallazgo A3 ----------
select ok(
  has_function_privilege('authenticated', 'public.save_workout(jsonb)', 'EXECUTE'),
  'authenticated puede ejecutar save_workout'
);
select ok(
  not has_function_privilege('anon', 'public.save_workout(jsonb)', 'EXECUTE'),
  'anon NO puede ejecutar save_workout (hallazgo A3 verificado en vivo)'
);

select * from finish();

rollback;

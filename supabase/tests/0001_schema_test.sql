-- =============================================
-- GymTracker · 0001_schema_test — schema, seed y privilegios
-- Corre con: npx supabase test db --linked
-- =============================================
begin;

select plan(14);

-- ---------- seed ----------
select is((select count(*)::int from public.muscle_groups), 10, 'seed: 10 grupos musculares');
select is(
  (select count(*)::int from public.exercises where is_custom = false),
  48,
  'seed: 48 ejercicios globales'
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

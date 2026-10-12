-- =============================================
-- GymTracker · 0003_grants — privilegios de tabla
-- =============================================
-- RLS NO sustituye el GRANT. RLS filtra filas *dentro* de los privilegios que
-- el rol ya tiene; sin GRANT, cualquier consulta falla con 42501 aunque la
-- policy exista.
--
-- Detectado al aplicar 0001 y 0002 contra el proyecto hosted: la base rechazaba
-- SELECT sobre muscle_groups, exercises y workouts con
--   "permission denied for table ... (code 42501)".
--
-- La causa: Supabase expone las tablas nuevas a anon/authenticated por un
-- default de plataforma que depende de `[api] auto_expose_new_tables`, y ese
-- default NO se aplica en `db push` (solo en el stack local). Estos GRANT
-- explícitos hacen que las migraciones sean autosuficientes y portables a
-- cualquier Postgres, sin depender de un default que puede cambiar.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Catálogo global: solo lectura para usuarios autenticados. No hay policy de
-- escritura, así que no se otorga.
GRANT SELECT ON public.muscle_groups TO authenticated;

-- Catálogo de ejercicios: los usuarios crean y editan los suyos, y RLS restringe
-- la escritura a is_custom = true AND created_by = auth.uid().
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises TO authenticated;

-- Datos del usuario: RLS limita cada fila a su dueño.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_measurements TO authenticated;

-- `anon` queda deliberadamente SIN privilegios de tabla: es una SPA privada
-- detrás de login y no necesita leer nada antes de autenticarse. Las policies de
-- lectura pública del catálogo siguen existiendo, pero no son alcanzables sin un
-- GRANT, que es la postura más segura de las dos.

-- service_role: tareas administrativas y el harness de tests de RLS.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- No hay nada que otorgar sobre secuencias: todas las PK son UUID, generados por
-- gen_random_uuid() o por el cliente. Si algún día se agrega una columna SERIAL,
-- va a necesitar su GRANT propio — este archivo no lo cubre.

-- =============================================
-- GymTracker · seed — muscle_groups + catálogo
-- Se ejecuta con `supabase db reset`, o contra el proyecto linkeado con
-- `supabase db push --include-seed`. NUNCA en migraciones.
--
-- Es IDEMPOTENTE a propósito: se puede re-correr para agregar catálogo nuevo
-- sin duplicar filas. Los INSERT de ejercicios se apoyan en
-- `ux_exercises_global_name` (migración 0005), índice único parcial sobre
-- (muscle_group_id, lower(name)) para el catálogo global.
-- =============================================

INSERT INTO public.muscle_groups (name, icon) VALUES
  ('Pecho', '🫁'), ('Espalda', '🔙'), ('Hombros', '🏔️'),
  ('Bíceps', '💪'), ('Tríceps', '🦾'), ('Piernas', '🦵'),
  ('Glúteos', '🍑'), ('Core', '🎯'), ('Cardio', '❤️'),
  ('Cuerpo Completo', '🏋️')
ON CONFLICT (name) DO NOTHING;

-- M5: 'Hip Thrust' quedó cargado bajo 'Piernas'. Se mueve a 'Glúteos', que es su
-- grupo. Idempotente: si ya está en Glúteos, el WHERE no matchea nada.
UPDATE public.exercises
SET muscle_group_id = (SELECT id FROM public.muscle_groups WHERE name = 'Glúteos')
WHERE name = 'Hip Thrust'
  AND is_custom = false
  AND muscle_group_id = (SELECT id FROM public.muscle_groups WHERE name = 'Piernas');

-- Helper: insertar por nombre de grupo (evita IDs hardcodeados)
-- Pecho
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Pecho')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Press Banca'), ('Press Banca Inclinado'), ('Press Banca Declinado'),
  ('Aperturas con Mancuernas'), ('Fondos en Paralelas'),
  ('Press con Mancuernas'), ('Crossover en Polea')) AS t(e)
ON CONFLICT DO NOTHING;

-- Espalda
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Espalda')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Dominadas'), ('Remo con Barra'), ('Remo con Mancuerna'),
  ('Jalón al Pecho'), ('Remo en Polea Baja'),
  ('Peso Muerto'), ('Pull-over')) AS t(e)
ON CONFLICT DO NOTHING;

-- Hombros
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Hombros')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Press Militar'), ('Elevaciones Laterales'), ('Elevaciones Frontales'),
  ('Pájaros'), ('Face Pull'), ('Press Arnold')) AS t(e)
ON CONFLICT DO NOTHING;

-- Bíceps
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Bíceps')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Curl con Barra'), ('Curl con Mancuernas'), ('Curl Martillo'),
  ('Curl en Banco Scott'), ('Curl en Polea')) AS t(e)
ON CONFLICT DO NOTHING;

-- Tríceps
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Tríceps')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Extensión en Polea'), ('Press Francés'), ('Fondos en Banco'),
  ('Extensión con Mancuerna'), ('Kick-back')) AS t(e)
ON CONFLICT DO NOTHING;

-- Piernas
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Piernas')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Sentadilla'), ('Prensa de Piernas'), ('Extensión de Cuádriceps'),
  ('Curl de Piernas'), ('Sentadilla Búlgara'),
  ('Peso Muerto Rumano'), ('Zancadas'), ('Elevación de Talones')) AS t(e)
ON CONFLICT DO NOTHING;

-- Glúteos (M5: el grupo no tenía ningún ejercicio)
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Glúteos')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Hip Thrust'), ('Puente de Glúteos'), ('Patada de Glúteo en Polea'),
  ('Abducción de Cadera en Máquina'), ('Sentadilla Sumo')) AS t(e)
ON CONFLICT DO NOTHING;

-- Core
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Core')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Plancha'), ('Crunch'), ('Russian Twist'),
  ('Elevación de Piernas'), ('Ab Wheel')) AS t(e)
ON CONFLICT DO NOTHING;

-- Cardio
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Cardio')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Caminadora'), ('Bicicleta Estática'), ('Elíptica'),
  ('Saltar Cuerda')) AS t(e)
ON CONFLICT DO NOTHING;

-- Cuerpo Completo (M5: el grupo no tenía ningún ejercicio)
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Cuerpo Completo')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Burpee'), ('Thruster'), ('Swing con Kettlebell'),
  ('Clean and Press'), ('Snatch con Mancuerna')) AS t(e)
ON CONFLICT DO NOTHING;

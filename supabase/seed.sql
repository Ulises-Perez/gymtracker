-- =============================================
-- GymTracker · seed — muscle_groups + catálogo
-- Se ejecuta con `supabase db reset`. NUNCA en migraciones.
-- =============================================

INSERT INTO public.muscle_groups (name, icon) VALUES
  ('Pecho', '🫁'), ('Espalda', '🔙'), ('Hombros', '🏔️'),
  ('Bíceps', '💪'), ('Tríceps', '🦾'), ('Piernas', '🦵'),
  ('Glúteos', '🍑'), ('Core', '🎯'), ('Cardio', '❤️'),
  ('Cuerpo Completo', '🏋️')
ON CONFLICT (name) DO NOTHING;

-- Helper: insertar por nombre de grupo (evita IDs hardcodeados)
-- Pecho
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Pecho')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Press Banca'), ('Press Banca Inclinado'), ('Press Banca Declinado'),
  ('Aperturas con Mancuernas'), ('Fondos en Paralelas'),
  ('Press con Mancuernas'), ('Crossover en Polea')) AS t(e);

-- Espalda
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Espalda')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Dominadas'), ('Remo con Barra'), ('Remo con Mancuerna'),
  ('Jalón al Pecho'), ('Remo en Polea Baja'),
  ('Peso Muerto'), ('Pull-over')) AS t(e);

-- Hombros
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Hombros')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Press Militar'), ('Elevaciones Laterales'), ('Elevaciones Frontales'),
  ('Pájaros'), ('Face Pull'), ('Press Arnold')) AS t(e);

-- Bíceps
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Bíceps')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Curl con Barra'), ('Curl con Mancuernas'), ('Curl Martillo'),
  ('Curl en Banco Scott'), ('Curl en Polea')) AS t(e);

-- Tríceps
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Tríceps')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Extensión en Polea'), ('Press Francés'), ('Fondos en Banco'),
  ('Extensión con Mancuerna'), ('Kick-back')) AS t(e);

-- Piernas
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Piernas')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Sentadilla'), ('Prensa de Piernas'), ('Extensión de Cuádriceps'),
  ('Curl de Piernas'), ('Sentadilla Búlgara'), ('Hip Thrust'),
  ('Peso Muerto Rumano'), ('Zancadas'), ('Elevación de Talones')) AS t(e);

-- Core
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Core')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Plancha'), ('Crunch'), ('Russian Twist'),
  ('Elevación de Piernas'), ('Ab Wheel')) AS t(e);

-- Cardio
WITH mg AS (SELECT id FROM public.muscle_groups WHERE name = 'Cardio')
INSERT INTO public.exercises (name, muscle_group_id, is_custom)
SELECT e, (SELECT id FROM mg), false FROM (VALUES
  ('Caminadora'), ('Bicicleta Estática'), ('Elíptica'),
  ('Saltar Cuerda')) AS t(e);

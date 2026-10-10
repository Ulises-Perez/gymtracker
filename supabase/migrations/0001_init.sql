-- =============================================
-- GymTracker · 0001_init — schema + RLS + storage
-- =============================================

-- ---- Función propia para updated_at ----
-- (No depende de la extensión moddatetime, que puede no estar
-- habilitada en Supabase Cloud.)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================
-- profiles (1:1 con auth.users)
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  weight_unit TEXT DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')), -- solo display
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile"
  ON public.profiles FOR ALL
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- muscle_groups
-- =============================================
CREATE TABLE public.muscle_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT
);

ALTER TABLE public.muscle_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read muscle groups"
  ON public.muscle_groups FOR SELECT USING (true);

-- =============================================
-- exercises — RLS separada por operación.
-- El catálogo global (is_custom=false) es read-only:
-- ningún usuario puede UPDATE/DELETE una fila global.
-- =============================================
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT, -- reservado para i18n futuro
  muscle_group_id UUID REFERENCES public.muscle_groups(id),
  is_custom BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read exercises"
  ON public.exercises FOR SELECT USING (true);

CREATE POLICY "insert own custom"
  ON public.exercises FOR INSERT
  WITH CHECK (is_custom = true AND created_by = (select auth.uid()));

CREATE POLICY "update own custom"
  ON public.exercises FOR UPDATE
  USING (is_custom = true AND created_by = (select auth.uid()))
  WITH CHECK (is_custom = true AND created_by = (select auth.uid()));

CREATE POLICY "delete own custom"
  ON public.exercises FOR DELETE
  USING (is_custom = true AND created_by = (select auth.uid()));

-- =============================================
-- workouts — SIN constraint UNIQUE(user_id,date,title):
-- entrenar dos veces el mismo día con el mismo título es legítimo.
-- =============================================
CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT,
  notes TEXT,
  duration_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workouts"
  ON public.workouts FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TRIGGER trg_workouts_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- workout_sets — user_id DENORMALIZADO para RLS O(1)
-- (comparación directa en vez de subquery contra workouts).
-- weight_kg SIEMPRE en kg; la unidad preferida es solo display.
-- =============================================
CREATE TABLE public.workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  set_number INT NOT NULL,
  reps INT,
  weight_kg DECIMAL(6,2),
  rpe DECIMAL(3,1) CHECK (rpe >= 1 AND rpe <= 10),
  is_warmup BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sets"
  ON public.workout_sets FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- personal_records — best_1rm con fórmula Epley: peso * (1 + reps/30)
-- =============================================
CREATE TABLE public.personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  best_1rm DECIMAL(6,2),
  max_weight_kg DECIMAL(6,2),
  max_reps_at_max_weight INT,
  achieved_at DATE NOT NULL,
  UNIQUE(user_id, exercise_id)
);

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own PRs"
  ON public.personal_records FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- body_measurements (Fase 6)
-- =============================================
CREATE TABLE public.body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own measurements"
  ON public.body_measurements FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- Índices
-- =============================================
CREATE INDEX idx_workouts_user_date ON public.workouts(user_id, date DESC);
CREATE INDEX idx_sets_user_exercise ON public.workout_sets(user_id, exercise_id, created_at DESC);
CREATE INDEX idx_sets_workout ON public.workout_sets(workout_id);
CREATE INDEX idx_exercises_muscle ON public.exercises(muscle_group_id);
CREATE INDEX idx_exercises_custom ON public.exercises(created_by) WHERE is_custom = true;
CREATE INDEX idx_pr_user ON public.personal_records(user_id);
CREATE INDEX idx_body_user_date ON public.body_measurements(user_id, date DESC);

-- =============================================
-- Auto-crear perfil al registrarse
-- (search_path fijo previene hijacking; SECURITY DEFINER requerido
-- porque el trigger corre sobre auth.users.)
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- Storage: bucket de avatares
-- Lectura pública (la URL pública sirve el avatar sin firmar) y escritura
-- restringida al dueño por prefijo de path.
-- Convención de subida: '<user_id>/<archivo>'.
-- Se usa `storage.foldername(name)[1]` y no la columna `owner`, que está
-- deprecada en Supabase (hoy el uploader queda en `owner_id`, text).
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users manage own avatar"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

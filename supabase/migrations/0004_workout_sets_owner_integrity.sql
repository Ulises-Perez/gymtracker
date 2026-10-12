-- =============================================
-- 0004 — Guard de integridad de `workout_sets` (hallazgo A2)
--
-- `workout_sets.user_id` está desnormalizado a propósito: la policy de RLS
-- compara contra esa columna en vez de hacer una subquery contra `workouts`,
-- o sea O(1) por fila en vez de O(log n). El costo era que esa copia podía
-- quedar inconsistente con `workouts.user_id` — nada lo impedía — y
-- `exercise_progress` confía en ella para agregar.
--
-- El guard es declarativo (FK compuesto) y no un trigger: lo impone el motor en
-- todo INSERT y UPDATE, incluso en los caminos que no pasan por `save_workout`,
-- y no se puede desactivar por accidente. El precio es el índice que exige el
-- FK compuesto sobre `workouts`; en una tabla que crece a lo sumo unas pocas
-- filas por entrenamiento, es barato.
-- =============================================

-- Postgres exige un UNIQUE sobre las columnas referenciadas. `id` ya es PK, así
-- que la unicidad de (id, user_id) es consecuencia lógica; el índice existe
-- porque el motor no infiere esa consecuencia.
ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_id_user_id_key UNIQUE (id, user_id);

-- Se reemplaza el FK de una sola columna por el compuesto: el compuesto también
-- cascadea, así que mantener los dos solo agregaría una verificación redundante
-- por escritura.
ALTER TABLE public.workout_sets
  DROP CONSTRAINT workout_sets_workout_id_fkey;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_workout_owner_fkey
  FOREIGN KEY (workout_id, user_id)
  REFERENCES public.workouts (id, user_id)
  ON DELETE CASCADE;

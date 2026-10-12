-- =============================================
-- 0005 — Unicidad del catálogo global de ejercicios (hallazgo M5)
--
-- El seed tiene que poder re-correr para agregar catálogo sin duplicar filas, y
-- para eso `INSERT ... ON CONFLICT DO NOTHING` necesita algo contra lo que
-- chocar: sin restricción, la idempotencia es una intención, no una garantía.
--
-- El índice es PARCIAL (`is_custom = false`) a propósito: el catálogo global es
-- único por (grupo, nombre), mientras que los ejercicios custom de cada usuario
-- quedan afuera, que es justamente donde los nombres repetidos son legítimos.
-- =============================================

CREATE UNIQUE INDEX ux_exercises_global_name
  ON public.exercises (muscle_group_id, lower(name))
  WHERE is_custom = false;

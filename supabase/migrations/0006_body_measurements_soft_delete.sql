-- =============================================
-- 0006 — `body_measurements` entra en la convención de soft delete (hallazgo M4)
--
-- Era la única tabla de usuario sin `deleted_at`, así que la regla "toda query
-- filtra `.is('deleted_at', null)`" (PLAN.md §4.1) no se podía aplicar sin
-- olvidarse de ella. El resto de las tablas ya la tiene.
--
-- Ojo con el detalle que trae el soft delete: `UNIQUE(user_id, date)` bloquearía
-- volver a cargar la medición de un día que se borró, porque la fila sigue
-- existiendo. El invariante real es "una medición VIVA por día", así que la
-- restricción se reemplaza por un índice único parcial sobre las filas vivas.
-- =============================================

ALTER TABLE public.body_measurements
  ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE public.body_measurements
  DROP CONSTRAINT body_measurements_user_id_date_key;

CREATE UNIQUE INDEX ux_body_measurements_live_date
  ON public.body_measurements (user_id, date)
  WHERE deleted_at IS NULL;

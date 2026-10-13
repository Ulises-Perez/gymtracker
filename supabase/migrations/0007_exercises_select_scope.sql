-- =============================================
-- 0007 — el catálogo global es de todos; cada ejercicio custom es de su dueño
--
-- La policy de lectura original era `FOR SELECT USING (true)` y, junto con el
-- `GRANT SELECT` a `authenticated` (0003), dejaba que **cualquier** usuario
-- autenticado leyera **todas** las filas de `exercises`: también las
-- `is_custom = true` de otros, con su `name`, su `description` y su `created_by`.
--
-- El plan solo pedía que el catálogo **global** fuera legible ("El catálogo global
-- (is_custom=false) es read-only: ningún usuario puede UPDATE/DELETE una fila
-- global"): que se lean los custom ajenos contradice esa intención, y ninguna
-- aserción lo cubría — la suite probaba que A no lee los *workouts* de B, nunca
-- los *ejercicios custom* de B.
--
-- El invariante real es: `is_custom = false` es catálogo compartido y
-- `is_custom = true` es de quien lo creó. El `COALESCE` no es decorativo: la
-- columna es nullable y `is_custom = false` **no** matchea NULL, así que sin él
-- una fila global insertada sin la columna explícita quedaría invisible para
-- todos.
--
-- No hay `CREATE OR REPLACE` para policies, así que se dropea y se recrea con el
-- mismo nombre: la aserción que verifica que existe sigue valiendo.
--
-- No toca datos: solo recorta qué filas se pueden leer.
-- =============================================

DROP POLICY "read exercises" ON public.exercises;

CREATE POLICY "read exercises"
  ON public.exercises FOR SELECT
  USING (
    COALESCE(is_custom, false) = false
    OR created_by = (select auth.uid())
  );

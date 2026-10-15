-- =============================================
-- 0013 — el bucket de avatares tiene tope y tipos permitidos
--
-- Hallazgo de `T6.1b`, y apareció al reportar lo que no se había probado: `0001` creó el bucket con
-- sólo `id`, `name` y `public`, así que `storage.buckets.file_size_limit` y `allowed_mime_types`
-- quedaron en **NULL** — o sea que **no había ningún límite del lado del servidor**.
--
-- Consecuencia, y no es teórica: el tope de 2 MB y los tres tipos de imagen que valida
-- `src/lib/avatar-api.ts` son una **puerta de UX y no una frontera**. Medido con una sonda real
-- contra el storage local, antes de esta migración:
--
--   · 3 MB con `content-type: image/png`  → 200   (el archivo entró)
--   · `<svg/>` con `content-type: image/svg+xml` → 200   (también, y el cliente lo rechaza)
--
-- Cualquier cliente que no pase por la app —un `curl`, una versión vieja del bundle, un script— no
-- tiene por qué respetar el `<input accept>` ni el validador del navegador, y la lectura de este
-- bucket es **pública**: un objeto de megabytes cargado en una carpeta propia se sirve a quien tenga
-- la URL, y el usuario no tiene forma de saber que existe.
--
-- Los dos valores se alinean con lo que el cliente ya valida, y **el tope es el mismo número a
-- propósito**: dos topes distintos harían que el cliente rechace algo que el servidor aceptaría (o al
-- revés), y cuál de los dos mensajes ve el usuario dependería de cuál llegó primero. El número es un
-- único lugar, y ese lugar pasa a ser el servidor, que es el que no se puede rodear.
--
-- Lo que esta migración **no** hace: redimensionar. Un avatar se lee a ~96 px en una pantalla de
-- 360, así que 2 MB ya es un orden de magnitud más de lo necesario, y bajar la fidelidad de lo que
-- alguien subió es una decisión de producto que no se toma desde acá.
--
-- `UPDATE` y no `INSERT`: el bucket ya existe y su `id` es la clave de la policy de `0001`, así que
-- recrearlo perdería los objetos. Es idempotente por naturaleza: volver a escribir los mismos dos
-- valores no cambia nada.
-- =============================================

UPDATE storage.buckets
SET file_size_limit = 2097152, -- 2 MB, el mismo tope que valida `avatar-api.ts`
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'avatars';

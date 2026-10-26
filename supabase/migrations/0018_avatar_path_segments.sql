-- =============================================
-- GymTracker · 0018 — el path del avatar no puede llevar `.` ni `..`
--
-- La policy de `0001` compara el **primer** segmento del path contra `auth.uid()`:
--
--   (storage.foldername(name))[1] = (select auth.uid())::text
--
-- Ese primer segmento es el dueño, pero la comparación no dice nada del resto del
-- path. Un nombre como `<A>/../<B>/avatar-x.png` tiene `<A>` como primer segmento y
-- satisface el predicado; el cliente, además, usa un `startsWith('<A>/')` que el
-- mismo string también satisface. Si el storage-api normaliza `..` antes de resolver
-- el objeto, A podría borrar el avatar de B conociendo el nombre del archivo.
--
-- El guard del cliente no es una frontera: corre en el navegador de A. La policy es
-- la que puede rechazarlo, y ahora rechaza cualquier segmento `.` o `..` en el path.
--
-- El comportamiento exacto del storage-api frente a `..` está fuera de este repo; esta
-- migración no depende de esa respuesta: si lo rechaza, el predicado es redundante; si
-- lo normaliza, es el control que faltaba.
-- =============================================

DROP POLICY IF EXISTS "Users manage own avatar" ON storage.objects;

CREATE POLICY "Users manage own avatar"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND name !~ '(^|/)\.\.?(/|$)'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND name !~ '(^|/)\.\.?(/|$)'
  );

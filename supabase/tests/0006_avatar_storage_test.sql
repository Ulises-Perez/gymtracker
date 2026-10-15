-- =============================================
-- GymTracker · 0006_avatar_storage_test — quién puede tocar qué en el bucket
-- Corre con: npx supabase test db   (local)   ·   npx supabase test db --linked   (hosted)
--
-- El bucket `avatars` y su policy son de `0001`, o sea que este archivo no prueba una migración de
-- este tramo: prueba el contrato sobre el que el tramo se apoya. La escritura del avatar es lo único
-- del cliente que depende de permisos, y estos son los permisos:
--
--   · A escribe SU carpeta y nada más;
--   · B no escribe la carpeta de A, y A no escribe la de B;
--   · el prefijo de la policy es el id del usuario (`storage.foldername(name)[1]`), no la columna
--     `owner`, que está deprecada — la convención de subida `<user_id>/<archivo>` no es un acuerdo
--     entre capas: es la entrada de la policy;
--   · un nombre sin carpeta y otro bucket también se rechazan, porque si no la policy sería "cualquier
--     cosa dentro de avatars" en vez de "tu carpeta dentro de avatars";
--   · y la lectura pública: el bucket es `public`, que es lo que hace que la URL pública sirva el
--     avatar **sin** policy de SELECT y sin firmar nada. Lo que la policy sí cierra es la lectura fila a
--     fila por SQL (`anon` y otro usuario ven cero), y eso es exactamente por qué el cliente guarda y
--     dibuja una URL pública en vez de descargar el objeto como un usuario autenticado.
--
-- Impersonación con el patrón del resto de la suite: `set local role authenticated` (o `anon`) +
-- `request.jwt.claims`, y las aserciones de vuelta como `postgres`. Todo en una transacción que
-- termina en rollback: no queda ningún usuario ni ningún objeto de prueba en la base.
-- =============================================

begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-d000-000000000001', 'pgtap-avatar-a@example.test'),
  ('00000000-0000-4000-d000-000000000002', 'pgtap-avatar-b@example.test');

create temporary table t_ctx as
select
  '00000000-0000-4000-d000-000000000001'::uuid as user_a,
  '00000000-0000-4000-d000-000000000002'::uuid as user_b,
  '00000000-0000-4000-d000-000000000001/avatar-a.png' as path_a,
  '00000000-0000-4000-d000-000000000002/avatar-b.png' as path_b;

-- =============================================
-- La lectura pública, que es de donde sale la URL
-- =============================================
select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'el bucket avatars es público: la URL pública sirve el avatar sin firmar nada y sin policy de SELECT'
);

select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users manage own avatar'
  ),
  1,
  'la policy existe, y una sola vez: una segunda permisiva no pasaría desapercibida'
);

select is(
  (
    select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users manage own avatar'
  ),
  'ALL',
  'la policy cubre INSERT, UPDATE, DELETE y SELECT: subir, reemplazar y borrar caen bajo la misma regla'
);

select ok(
  (
    select qual like '%foldername%' and with_check like '%foldername%'
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users manage own avatar'
  ),
  'y se apoya en storage.foldername(name)[1], no en la columna owner, que está deprecada'
);

-- =============================================
-- A escribe su propia carpeta
-- =============================================
do $own$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  insert into storage.objects (bucket_id, name) values ('avatars', c.path_a);

  set local role postgres;
end
$own$;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name = (select path_a from t_ctx)),
  1,
  'A escribe su propio avatar: la carpeta que lleva su id es la que le corresponde'
);

-- =============================================
-- B no escribe la carpeta de A
-- =============================================
do $refused$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', c.user_a::text || '/intruso.png');

    set local role postgres;
  exception when others then
    set local role postgres;
    perform set_config('gt.state_b_into_a', sqlstate, true);
  end;
end
$refused$;

select is(
  current_setting('gt.state_b_into_a', true),
  '42501',
  'B no puede escribir en la carpeta de A: la policy lo rechaza con un permiso denegado'
);

-- =============================================
-- A no escribe la carpeta de B
-- =============================================
do $refused_reverse$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', c.user_b::text || '/intruso.png');

    set local role postgres;
  exception when others then
    set local role postgres;
    perform set_config('gt.state_a_into_b', sqlstate, true);
  end;
end
$refused_reverse$;

select is(
  current_setting('gt.state_a_into_b', true),
  '42501',
  'y A tampoco escribe en la de B: la regla es la carpeta propia, y no la ajena'
);

-- ============================================================
-- El nombre tiene que tener la forma de la policy
-- ============================================================
-- Sin este par de casos la policy se leería como "cualquier cosa dentro de avatars": acá se prueba que
-- lo que se compara es el **primer segmento** del nombre.
do $no_folder$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    insert into storage.objects (bucket_id, name) values ('avatars', 'avatar-suelto.png');

    set local role postgres;
  exception when others then
    set local role postgres;
    perform set_config('gt.state_no_folder', sqlstate, true);
  end;
end
$no_folder$;

select is(
  current_setting('gt.state_no_folder', true),
  '42501',
  'un nombre sin carpeta no entra: no hay primer segmento que comparar, así que no es la carpeta de nadie'
);

do $other_bucket$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  begin
    insert into storage.objects (bucket_id, name) values ('otro-bucket', c.path_a);

    set local role postgres;
  exception when others then
    set local role postgres;
    perform set_config('gt.state_other_bucket', sqlstate, true);
  end;
end
$other_bucket$;

select is(
  current_setting('gt.state_other_bucket', true),
  '42501',
  'y otro bucket tampoco: la policy está acotada a avatars y no a cualquier objeto de storage'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name like (select user_a::text from t_ctx) || '/%'),
  1,
  'ninguno de los intentos rechazados dejó una fila en la carpeta de A'
);

-- =============================================
-- `anon` no escribe
-- =============================================
-- El bucket es público para leer, y eso no es lo mismo que público para escribir: la lectura pública
-- la sirve el endpoint público del servicio de storage, que no pasa por acá.
do $anon_write$
declare
  c record;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  begin
    insert into storage.objects (bucket_id, name) values ('avatars', c.path_a);

    set local role postgres;
  exception when others then
    set local role postgres;
    perform set_config('gt.state_anon_write', sqlstate, true);
  end;
end
$anon_write$;

select is(
  current_setting('gt.state_anon_write', true),
  '42501',
  'anon no puede escribir: sin sesión no hay carpeta propia que reclamar'
);

-- =============================================
-- La lectura: nadie lee la fila de otro
-- =============================================
do $anon_read$
declare
  c record;
  v_rows int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  select count(*)::int into v_rows from storage.objects where bucket_id = 'avatars';

  set local role postgres;
  perform set_config('gt.anon_rows', v_rows::text, true);
end
$anon_read$;

select is(
  current_setting('gt.anon_rows')::int,
  0,
  'anon no lista los objetos del bucket: la lectura pública es del endpoint público, no del listado'
);

do $owner_read$
declare
  c record;
  v_rows int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_a)::text, true);
  set local role authenticated;

  select count(*)::int into v_rows
  from storage.objects
  where bucket_id = 'avatars' and name = c.path_a;

  set local role postgres;
  perform set_config('gt.a_rows', v_rows::text, true);
end
$owner_read$;

select is(
  current_setting('gt.a_rows')::int,
  1,
  'A sí ve la fila de su propio avatar'
);

do $foreign_read$
declare
  c record;
  v_rows int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  select count(*)::int into v_rows
  from storage.objects
  where bucket_id = 'avatars' and name = c.path_a;

  set local role postgres;
  perform set_config('gt.b_rows', v_rows::text, true);
end
$foreign_read$;

select is(
  current_setting('gt.b_rows')::int,
  0,
  'B no ve la fila del avatar de A: por eso el cliente no descarga el objeto, muestra su URL pública'
);

-- =============================================
-- B no reemplaza el avatar de A
-- =============================================
-- Un UPDATE no falla cuando la RLS lo filtra: afecta cero filas y termina bien. La aserción tiene que
-- mirar el número de filas, porque el silencio de un UPDATE filtrado se parece demasiado al éxito.
do $foreign_update$
declare
  c record;
  v_rows int;
begin
  select * into c from t_ctx;
  perform set_config('request.jwt.claims', json_build_object('sub', c.user_b)::text, true);
  set local role authenticated;

  update storage.objects
  set name = c.user_a::text || '/robado.png'
  where bucket_id = 'avatars' and name = c.path_a;

  get diagnostics v_rows = row_count;
  set local role postgres;
  perform set_config('gt.b_update_rows', v_rows::text, true);
end
$foreign_update$;

select is(
  current_setting('gt.b_update_rows')::int,
  0,
  'el reemplazo de B sobre el avatar de A afecta cero filas, no un error silencioso y un objeto cambiado'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name = (select path_a from t_ctx)),
  1,
  'y el objeto de A sigue donde estaba, con su nombre original'
);

--
-- Los límites del bucket, que son la diferencia entre una puerta de UX y una frontera.
--
-- Medido con una sonda real antes de `0013`: un archivo de 3 MB y un `image/svg+xml` entraban con
-- 200, así que el tope de 2 MB y los tres tipos que valida `avatar-api.ts` sólo existían en el
-- navegador. Estas dos aserciones son el RED de esa migración: fallan con `NULL` antes de aplicarla.
--
select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  2097152::bigint,
  'el bucket tiene tope de tamaño: la validación del cliente no es la única puerta'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/png', 'image/jpeg', 'image/webp'],
  'y tipos permitidos: un SVG no entra por la puerta del servidor aunque el cliente lo rechace'
);

select * from finish();
rollback;

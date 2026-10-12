# GymTracker MVP — Tareas ODD

**Estado:** Fase 0 cerrada (el template de entorno se entrega como `env.example` porque la política del harness bloquea rutas `.env*`; el `.env` lo crea el usuario). **Fase 1 cerrada salvo T1.7**: schema, RLS, GRANTs, catálogo, integridad y soft delete aplicados y verificados con pgTAP contra la base real (**21/21**). El harness de tests contra hosted quedó funcionando; ver "Hallazgos del harness".
**Repo:** `C:\Users\ulise\OneDrive\Documentos\Pogramming\JS\React\GymTracker`, rama `feat/gymtracker-mvp` (repo propio, fuera del repo accidental del home). `node_modules` es un **junction** a `C:\Users\ulise\develop\gymtracker-modules\node_modules` para no sincronizar 511 MB / 30.918 archivos.
**Fuente:** `PLAN.md` (revisado 2026-10-10) + `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rpcs.sql`, `supabase/seed.sql`.
**Revisión:** 2026-10-10. Hallazgos citados con `path:line`.
**No-objetivos (MVP):** social, rutinas con IA, push como dependencia, pagos, i18n.

---

## 0. Gate de decisiones — cerrado

| ID | Decisión | Resuelto como |
|----|----------|---------------|
| D1 | Ubicación y repo | `git init` propio, rama `feat/gymtracker-mvp`. **Revisada el 2026-10-11**: el proyecto volvió a OneDrive por convención del usuario, pero `node_modules` queda fuera con un junction a un store local |
| D2 | Fase 1 local (Docker) o hosted | Proyecto **hosted** de dev en Supabase (región São Paulo); Docker queda como opción futura |
| D3 | Parchear baseline o resolver por fase | Baseline parcheado antes de codear (`PLAN.md` + los 3 SQL + deps) |
| D4 | Primer incremento | **Fase 0 + Fase 1** (base verificable con review acotado) |

**Pendiente operativo de D2:** el proyecto hosted necesita que el usuario cree el proyecto en Supabase y autorice el `supabase login` (token) o entregue el `service_role`/connection string para `db push` y `gen types`.

---

## 1. Hallazgos de la revisión

### Bloqueantes (rompen algo real)

- **B1 · `recent_prs` con `LIMIT` inerte.** `supabase/migrations/0002_rpcs.sql:186-198` (duplicado en `PLAN.md:606`). Un `SELECT jsonb_agg(...)` sin `GROUP BY` devuelve **una** fila, así que `LIMIT 5` nunca recorta nada: el dashboard recibe **todos** los PRs, no 5. Fix: subconsulta interna `ORDER BY pr.achieved_at DESC LIMIT 5` y recién después agregar.
- **B2 · La cola offline no era durable como estaba documentada.** `PLAN.md:37,131` afirmaba que `persistQueryClient` conserva la cola de mutaciones y que solo faltaba `shouldDehydrateMutation`. **Diagnóstico corregido leyendo la fuente de `@tanstack/query-core`**: el default de ese predicado **no es `false`**, es `mutation.state.isPaused`, así que el agujero real es más fino — (a) una mutación solo llega a pausada mientras hay un retry pendiente, por lo que `retry: 0` la deja en error y no se persiste; (b) `resumePausedMutations()` filtra por `isPaused`, así que persistir otro estado deja una entrada muerta; (c) `dehydrateMutation` guarda solo `mutationKey`, `state`, `scope` y `meta`, y como el `mutationFn` no se serializa, una mutación restaurada **no tiene función que ejecutar**, mientras `Mutation.continue()` sí llama a `execute()`. La cola necesita un **dispatcher global** para ser reanudable. Además el retryer duerme el `retryDelay` **antes** de pausar: hay una ventana de ~2-3 s en la que la escritura offline todavía no está en disco. Zustand `persist` con IndexedDB sigue necesitando `StateStorage` propio e hidratación asíncrona.
- **B3 · `uuidv7()` en cliente sin dependencia.** `PLAN.md:130`. `crypto.randomUUID()` genera v4. Falta `uuid@^9` (soporta v7) o un generador propio; sin esto el DDL "IDs generados en cliente" no se puede cumplir.
- **B4 · Topología git rota.** `git rev-parse --show-toplevel` → `C:/Users/ulise`: el proyecto vive dentro del repo accidental del home (rama `master`, **0 commits**, sin remoto) y dentro de OneDrive, sin `.gitignore` para `node_modules/` ni `.supabase/`. Bloquea la disciplina de commits por work-unit y expone `.git` al sync de OneDrive.

### Altos (drift o rework costoso)

- **A1 · Policy de Storage con columna deprecada.** `0001_init.sql:226-227` usa `owner`; en Supabase actual el uploader se registra en `owner_id`, así que la policy puede no matchear nunca (avatar sube y no se lee). Además el comentario dice "bucket privado" (`0001_init.sql:220`) pero `public = true`.
- **A2 · Integridad de `workout_sets`.** `save_workout` inserta ids de set provistos por el cliente sin `ON CONFLICT`, y `user_id` está desnormalizado sin guard que lo ate a `workouts.user_id`. `exercise_progress` (`0002_rpcs.sql:145-155`) confía en esa columna. Falta trigger o CHECK compuesto.
- **A3 · RPCs sin `REVOKE`.** `0002_rpcs.sql:257-260` solo hace `GRANT`: Postgres otorga `EXECUTE` a `PUBLIC` por defecto, o sea que `anon` también puede invocarlas. `save_workout` se salva con `IF v_user_id IS NULL`, pero el endurecimiento (`REVOKE ... FROM public, anon`) falta.
- **A4 · PRs monótonos.** `save_workout` borra y reinserta sets, pero `personal_records` nunca baja: editar o borrar la serie que logró el PR deja el PR viejo como mejor marca. Documentar como limitación MVP o recalcular.
- **A5 · Decimales como string.** `weight_kg`, `best_1rm`, `total_volume` son `DECIMAL`; supabase-js los devuelve como **string**. Riesgo de concatenación, `.toFixed` roto y comparaciones inválidas en gráficas e inputs. Necesita regla de mapeo en `src/lib`.
- **A6 · Harness de test RLS inválido.** `PLAN.md:819` propone "dos usuarios A/B vía service_role + anon", pero `service_role` **bypassea RLS**: ese test pasa siempre y no prueba nada. Hace falta `SET ROLE authenticated` + `request.jwt.claims` (pgTAP) o dos sesiones reales firmadas.
- **A7 · Drift de scaffold y dependencias.**
  - `PLAN.md:800` (`npm create vite@latest gymtracker ...`) anidaría `gymtracker/` dentro de un root que ya contiene `supabase/`. Debe scaffoldeárselo en `.`.
  - Faltan en `package.json` (§2) contra la tabla de stack: Radix Dialog/Toast, `@tailwindcss/vite` (integración v4+Vite, §2 solo lista `tailwindcss`), `uuid`, `jsdom`/`happy-dom`, `@testing-library/jest-dom` y `@playwright/test` (el plan lista `playwright`, que es la librería, no el runner). En RR7 el paquete canónico es `react-router`.
  - `injectManifest` exige un `src/sw.ts` propio con `self.__WB_MANIFEST` y `precacheAndRoute`; §5 no lo lista.
  - Falta `vercel.json` con rewrite a `/index.html`: sin eso los deep links de React Router dan 404 en Vercel.
- **A8 · Presupuesto 180 KB gzip optimista** con Supabase + Zod + RR7 + RHF + Sentry + Inter de por medio. Medir en Fase 0 con `rollup-plugin-visualizer` antes de fijarlo, y cargar Sentry por import dinámico post-paint.
- **A9 · Las tablas no tenían `GRANT` (nuevo, detectado contra la base hosted).** Al aplicar `0001`/`0002` por primera vez, toda lectura falló con **`42501 permission denied for table ...`**. La causa: las migraciones crean policies de RLS pero **nunca otorgan privilegios de tabla**, y RLS filtra filas *dentro* de los privilegios del rol, no los sustituye. Supabase expone tablas nuevas por un default de plataforma que depende de `[api] auto_expose_new_tables`, y **ese default no se aplica en `db push`** (solo en el stack local). Fix: `0003_grants.sql` con GRANTs explícitos, para que las migraciones sean autosuficientes y no dependan de un default que puede cambiar. **Ninguna cantidad de revisión estática de 588 líneas lo iba a encontrar**: hacía falta una base real.

### Medios

- **M1** `ON CONFLICT (id) DO UPDATE` no actualiza `date` (`0002_rpcs.sql:48`): no se puede re-fechar un workout existente. Documentarlo.
- **M2** Ninguna fase cubre borrar un workout ni el historial; y la convención soft-delete ("todo query filtra `.is('deleted_at', null)`", §4.1) no tiene helper que la haga cumplir.
- **M3** `duration_minutes` no se calcula en ningún punto desde `startTime` del store.
- **M4** `body_measurements` no tiene `deleted_at`, rompe la convención global de soft delete.
- **M5** El seed deja `Glúteos` y `Cuerpo Completo` sin ejercicios ("Hip Thrust" quedó bajo Piernas) → el filtro por grupo muscular muestra grupos vacíos.
- **M6** Edición concurrente desde dos dispositivos = last-write-wins con reemplazo total de sets → pérdida silenciosa. Documentar como limitación MVP.
- **M7** Sin ADR para las decisiones de stack; el Apéndice de parches es trazabilidad de bugs, no de decisiones.

### Hallazgos del harness de tests contra hosted (2026-10-12)

Ninguno era visible leyendo: aparecieron en la primera ejecución real de `supabase test db --linked`.

- **H1 · El rol de `pg_prove` no puede leer tablas.** El CLI crea un rol temporal (`cli_login_postgres`, contraseña que caduca a los 5 minutos) y pg_prove se conecta con él. Es miembro de `postgres` **con `INHERIT FALSE`** (`pg_has_role(...,'member') = true`), así que no hereda privilegios y toda lectura falla con `permission denied for table ...`. Fix: el test arranca con `set local role postgres`, la misma escalada que el CLI hace en sus propios queries.
- **H2 · pgTAP vive en `extensions` y el `search_path` no lo incluye.** El CLI ya instala la extensión ahí (dueño: `supabase_admin`) y el `search_path` de la conexión es `"$user", public`. Sin traer `extensions` explícitamente: `function plan(integer) does not exist`. El `GRANT USAGE` sobre `extensions` para el rol temporal resultó **innecesario** en cuanto el test escala a `postgres` (que sí tiene USAGE): se otorgó durante el diagnóstico, se revocó y el suite siguió en **21/21**. O sea que la base quedó sin privilegios fuera de las migraciones.
- **H3 · `plan(14)` contra 15 aserciones.** Defecto propio del archivo de tests, invisible mientras nunca se ejecutaba.
- **H4 · `db push --include-seed` NO ejecuta el seed.** El CLI solo registra el hash del archivo y lo deja marcado como aplicado ("Updating seed hash to supabase/seed.sql"); el catálogo siguió en 48 ejercicios después del push. Para aplicar catálogo al proyecto hosted hay que correrlo explícitamente: `supabase db query --linked -f supabase/seed.sql`. Por eso el seed es idempotente (migración 0005 + `ON CONFLICT DO NOTHING`).
- **H5 · `db query --linked` no es oráculo del catálogo.** Corre como `postgres`, pero su `pg_proc` **no ve las funciones de pgTAP** (0 filas para `plan`, mientras la sesión de pg_prove ve 1 `plan` y 8 sobrecargas de `fk_ok`). Sirve para datos, `pg_constraint`, `pg_indexes` e `information_schema`; no para concluir "esa función no existe".
- **H6 · `fk_ok` de pgTAP tiene 8 sobrecargas** y la llamada posicional `(schema, tabla, nombre_del_constraint, descripción)` cae en otra sobrecarga y falla. La aserción del FK compuesto se escribe con una consulta a `pg_constraint` que verifica la **forma** (columnas y columnas referenciadas): más fuerte que chequear el nombre, porque un FK simple contra `workouts(id)` volvería a dejar `user_id` libre, que es justo lo que A2 prohíbe.

---

## 2. Tareas

Convención: `[ ]` pendiente, `[x]` cerrada con evidencia. Cada tarea cierra con al menos un commit de work-unit en la rama de feature.

### Fase 0 — Setup + CI

- [x] **T0.1** (D1) Repo aislado + `.gitignore` + `.gitattributes` + scaffold Vite 8 / React 19 / TS 6 **en el root del repo**. `create-vite` pide confirmación en un directorio no vacío, así que se generó en un directorio temporal fuera del repo y se copió: `PLAN.md`, `odd/`, `supabase/`, `.gitignore` y `.gitattributes` intactos. Sobrantes del template (oxlint, `icons.svg`, `App.css`, assets demo) eliminados. Verificado en `813f501`.
- [x] **T0.2** TS `strict` + `noUncheckedIndexedAccess`; ESLint 10 flat config (`typescript-eslint` + react-hooks + react-refresh) + Prettier + Husky v9 + lint-staged. El hook se probó en el propio commit `813f501` (lint-staged corrió `eslint --fix` y `prettier --write` y stageó los cambios).
- [x] **T0.3** Tailwind v4 vía `@tailwindcss/vite` + tokens de diseño §5 en `src/index.css` (`@theme`); `backdrop-filter` restringido a `.bottom-nav` y `.overlay`.
- [x] **T0.4** Dependencias completas, incluidas las faltantes de A7 (`uuid` 14 —`v7()` disponible—, Radix Dialog/Toast, `@playwright/test`, `@testing-library/jest-dom`, `jsdom`).
- [x] **T0.5** PWA con `strategies: 'injectManifest'`, `src/sw.ts` propio y `registerType: 'prompt'`: el worker nuevo no se activa hasta que el usuario acepte (`SKIP_WAITING` explícito), así una actualización no recarga la app en medio de una serie. `tsconfig.sw.json` compila el worker con `lib: WebWorker` y `tsconfig.app.json` lo excluye, evitando el conflicto de identificadores duplicados entre DOM y WebWorker. **Dos defectos de precache encontrados al verificar el manifiesto generado**: `stats.html` (el reporte del visualizer) se estaba precacheando, y `woff2` no estaba en los globs por defecto, así que el shell habría renderizado offline con fuentes de fallback. Corregido: el reporte ahora se escribe en `stats/` (fuera de `dist/`) y los globs incluyen `woff2` y excluyen los subsets cirílico, griego y vietnamita. Precache final: 8 entradas / 366.18 KiB.
- [x] **T0.6** Sentry por import dinámico, solo en `PROD` y solo si hay `VITE_SENTRY_DSN`, invocado después del primer render. Verificado por partida doble: **sin** DSN el SDK se elimina por completo del build (Vite inlinea la variable como `undefined`, el guard queda estáticamente verdadero y Rollup borra el import dinámico); **con** DSN queda en un chunk aparte de 30.78 kB gzip y el inicial crece apenas de 69.87 a 70.27 kB gzip. Además se desactivó la recolección de PII (`dataCollection`), porque la app guarda peso corporal e historial.
- [x] **T0.7** CI en GitHub Actions (`lint → typecheck → test → build`, con caché de npm, `HUSKY=0` y grupo de concurrencia) + `vercel.json` con rewrite de todas las rutas a `/index.html` y `Cache-Control` de revalidación para `/sw.js` (un SW cacheado de más hace que el prompt de actualización nunca dispare). Pipeline validado ejecutando `HUSKY=0 npm ci` real: 625 paquetes desde el lockfile sin drift. **Plantilla de entorno entregada como `env.example`**: la ruta convencional `.env.example` está bloqueada de forma incondicional por la política de seguridad del harness (rechaza escrituras a `.env*` y no acepta autorización en conversación), así que el archivo salió sin el punto inicial, lo explica en su encabezado y renombrarlo es un solo comando. El contrato de variables quedó además documentado en `README.md` y tipado en `src/vite-env.d.ts`.
- [x] **T0.8** Bundle final medido: **JS inicial 69.87 kB gzip** (222.63 kB raw), **CSS 3.36 kB gzip**, chunk aparte de `workbox-window` 2.20 kB gzip, `index.html` 0.39 kB gzip, y el SDK de Sentry (30.78 kB gzip) fuera del inicial cuando hay DSN. Precacheados solo los subsets latinos de Inter. Presupuesto de referencia 180 kB gzip: el margen se sostiene, pero todavía no entraron router, TanStack Query, Supabase ni los gráficos.

### Fase 1 — Schema + RLS + Seed

- [x] **T1.1** (D3) B1 (`recent_prs`) y A3 (`REVOKE`) aplicados en el baseline y **verificados en vivo**: `save_workout` responde `42501 permission denied for function` a `anon`, o sea que el `REVOKE` hace efecto.
- [x] **T1.2** (D3) A1 aplicado en el baseline. `0001_init.sql` corrió contra la base hosted **sin errores**, incluidos el `INSERT` en `storage.buckets` y la policy sobre `storage.objects`.
- [x] **T1.3** Guard de integridad A2 (`workout_sets.user_id` ≡ `workouts.user_id`). Resuelto de forma declarativa en `0004_workout_sets_owner_integrity.sql`: `UNIQUE (id, user_id)` en `workouts` + FK compuesto `(workout_id, user_id) → workouts (id, user_id)`, que reemplaza al FK de una sola columna. El motor lo impone en todo INSERT/UPDATE, sin depender de que el camino pase por `save_workout`. Verificado en vivo y por aserción (forma del FK, no solo su nombre).
- [x] **T1.4** (D2) `supabase init` hecho (`config.toml`), proyecto hosted linkeado (`wcurruszasxgxzimlbdk`, **región `sa-east-1`**, Postgres 17.11, `ACTIVE_HEALTHY`), `0001`+`0002`+`0003` aplicadas con el seed cargado, y **tipos generados** en `src/types/database.ts` (451 líneas, las 7 tablas y las 4 RPC; typecheck limpio).
- [x] **T1.5** Seed: cubrir `Glúteos` y `Cuerpo Completo` (M5). **Cerrada**: `Hip Thrust` movido de `Piernas` a `Glúteos` y 9 ejercicios nuevos (4 más de glúteos, 5 de cuerpo completo) → **57 globales**. El seed pasó a ser **idempotente** (`ON CONFLICT DO NOTHING` contra `ux_exercises_global_name`, migración 0005) y se aplicó con `db query -f` (ver H4). Verificado contra la base: 57 globales, 0 grupos vacíos, `Piernas` 8, `Cuerpo Completo` 5, un solo `Hip Thrust`.
- [x] **T1.6** Suite pgTAP en `supabase/tests/0001_schema_test.sql`: **21 aserciones, ejecutadas contra la base real, 21/21 en verde**. Cubre seed (incluido M5), RLS habilitado en las 6 tablas, los GRANTs de tabla y de función (A9/A3), el FK compuesto (A2), `deleted_at` y el índice parcial (M4) y el índice único del catálogo (M5). Tres defectos que solo aparecían ejecutando (H1–H3) más dos hallazgos del CLI (H4–H6).
- [ ] **T1.7** Tests de `save_workout`: idempotencia por UUID, ownership `Forbidden`, Epley, warmups excluidos, PR no baja (A4).
- [x] **T1.8** Documentar limitaciones M1/M6 y agregar `deleted_at` a `body_measurements` (M4). **Cerrada**: `0006_body_measurements_soft_delete.sql` agrega `deleted_at` y reemplaza `UNIQUE(user_id, date)` por un índice único **parcial** sobre filas vivas — sin ese detalle, borrar una medición bloquearía volver a cargar el mismo día. M1, M6 y A4 quedaron documentados en el README ("Limitaciones conocidas del MVP").

**Aprendizaje operativo de la Fase 1**: `db push` y `gen types --linked` funcionan contra el proyecto hosted **sin Docker**, pero `test db --linked` y `db dump --linked` **lo requieren igual** (corren `pg_prove`/`pg_dump` en un contenedor). Elegir hosted en D2 no nos libra de necesitar el daemon para verificar RLS.

**Agregado 2026-10-12**: `db query --linked` (SQL arbitrario como `postgres`) tampoco necesita Docker y es la vía tanto para DML suelto como para aplicar el seed. Y **no correr dos comandos del CLI contra la base en paralelo**: `test db` junto con `db query` se colgó (el CLI rota la contraseña del rol temporal en cada corrida); secuencial siempre.

### Fase 2 — Auth + Shell

- [ ] **T2.1** `src/lib/supabase.ts` con `persistSession`. **Bloqueado**: necesita `VITE_SUPABASE_URL` y la anon key del proyecto hosted (D2). **Requisito de presupuesto**: debe exponerse como `getSupabase()` asíncrono con singleton perezoso — el cliente NO puede entrar al bundle inicial.
- [ ] **T2.2** `AuthContext` + `useAuth()` + `RequireAuth`. **Bloqueado** por T2.1.
- [ ] **T2.3** Login / Register / Forgot Password (RHF + Zod, errores en español). **Bloqueado** por T2.1. **Requisito de presupuesto**: las tres pantallas son rutas diferidas, para que Zod y RHF queden en su propio chunk.
- [x] **T2.4** Shell + BottomNav + skeletons, sin spinners — **cerrada salvo las transiciones con Motion**, que se posponen para no meter la librería en el bundle inicial. Entregado: `src/app/routes.tsx` (React Router 8 con cada ruta en su propio chunk lazy), `src/app/router.tsx`, `src/App.tsx`, `AppShell` (columna única, skip-link, padding que reserva la nav fija), `BottomNav` (4 destinos, `aria-current` vía `NavLink`, `end` en la raíz), `Skeleton`, `PagePlaceholder` y los 5 placeholders de ruta. **Iconos SVG en línea en vez de los emojis del plan**: los emojis renderizan distinto en cada plataforma y no heredan el color del texto, así que no pueden formar parte de un sistema de diseño. Verificado: 15 tests en 4 archivos + smoke test del build servido (`/`, `/history`, `/profile`, `/sw.js`, `/manifest.webmanifest` → 200, y `/history` devuelve el shell HTML, que es el fallback SPA que `vercel.json` debe reproducir).

### Fase 3 — Workout Core (offline-first) ⭐

- [x] **T3.1** (parcial) `src/lib/storage.ts` con un `AsyncStorage` sobre IndexedDB compartido por el persister y —más adelante— Zustand, porque ambos contratos exponen los mismos tres miembros. Falta el `useWorkoutStore` en sí.
- [x] **T3.2** QueryClient con `offlineFirst` en queries y mutaciones, `retry: 3`, predicado de persistencia explícito (solo pausadas) y persister en IndexedDB; `PersistQueryClientProvider` restaura antes de renderizar. **Verificado moviendo la conexión**, no desconectando la red a mano: una escritura offline se pausa, sobrevive a persistir y restaurar en un cliente nuevo, y se reanuda al volver la conexión recibiendo sus variables.
- [ ] **T3.2b** **Dispatcher de reanudación** (`defaultOptions.mutations.mutationFn`), requisito que el plan no tenía: sin él la mutación restaurada no tiene función que ejecutar (`No mutationFn found`). El payload debe ser autodescriptivo (unión discriminada con `kind`) porque `MutationFunction` recibe solo las variables, nunca la `mutationKey`.
- [ ] **T3.2c** Cerrar la ventana de pérdida: el retryer duerme el `retryDelay` antes de pausar, así que una escritura offline tarda ~2-3 s en quedar en disco y se pierde si el usuario cierra la pestaña antes. Flush del persister en `pagehide` / `visibilitychange: hidden`.
- [x] **T3.3** Generación de IDs v7 en cliente (`src/lib/ids.ts`), con test de orden temporal por fake timers.
- [ ] **T3.4** Catálogo en TQ + IndexedDB (`staleTime: Infinity`) + regla de mapeo de decimales (**A5**).
- [ ] **T3.5** Selector modal Radix + fuse + filtro por grupo.
- [ ] **T3.6** Inputs reps × peso con default = última serie (`last_weight_for_exercise`) + swipe-delete + reorder dnd-kit.
- [ ] **T3.7** Timer por `endTimestamp` + Wake Lock; `duration_minutes` al finalizar (**M3**).
- [ ] **T3.8** Ejercicio custom local → sync en `save_workout`.
- [ ] **T3.9** Finalizar → `save_workout` + animación de PRs + badge "pendiente de sync".
- [ ] **T3.10** E2E Playwright: login → workout → 3 series → guardar → historial.

### Fase 4 — Historial + Progreso

- [ ] **T4.1** Lista `useInfiniteQuery` con paginación keyset.
- [ ] **T4.2** Detalle workout y detalle ejercicio.
- [ ] **T4.3** uPlot lazy (peso máx / volumen / 1RM) sobre `exercise_progress`.
- [ ] **T4.4** Toggle kg/lb solo UI + helper de soft-delete (**M2**).
- [ ] **T4.5** Borrar workout / historial (**M2**).

### Fase 5 — Dashboard

- [ ] **T5.1** `dashboard_summary()` en una llamada: saludo, dots semanales, racha, PRs, último workout, FAB.
- [ ] **T5.2** Skeletons + prefetch de historial y catálogo.

### Fase 6 — Perfil + Extras

- [ ] **T6.1** Nombre, avatar (bucket `avatars`), unidad preferida.
- [ ] **T6.2** Stats derivadas (no columnas) + peso corporal.
- [ ] **T6.3** "Repetir workout" + export CSV + logout.

### Fase 7 — PWA Polish + Deploy

- [ ] **T7.1** Manifest + iconos maskable + favicon + splash iOS.
- [ ] **T7.2** SW: precache shell, `StaleWhileRevalidate` catálogo, **nunca** cachear auth ni escrituras.
- [ ] **T7.3** Prompt de instalación Android + instrucciones iOS + meta/OG.
- [ ] **T7.4** Lighthouse 90+ ×4, bundle dentro del presupuesto medido en T0.8.
- [ ] **T7.5** Deploy Vercel + test e2e en dispositivo real (offline → online) + README.

---

## 3. Registro de commits

| Tarea | Commit | Verificación |
|-------|--------|--------------|
| Baseline (B1, A1, A3 + drift del plan y deps) | `2d03890` `chore(baseline): patch reviewed plan findings and isolate repo` | Estático: diff leído. **Pendiente**: ejecución real de las migraciones (requiere proyecto hosted o `supabase start`) |
| T0.1–T0.4 | `813f501` `feat(setup): scaffold Vite React app with strict TS, Tailwind v4 and tooling` | `npm run typecheck` limpio · `npm run lint` limpio · `npm test` 6/6 en verde · `npm run build` en 818 ms · hook pre-commit ejecutado y observado en el propio commit |
| T0.5 | `6cdd7c0` `feat(pwa): register an injectManifest service worker in prompt mode` | `npm run build` verde · manifiesto de precache inspeccionado dentro de `dist/sw.js` (8 entradas, sin duplicados, con fuentes latinas y sin `stats.html`) |
| T0.6 | `3960d76` `feat(monitoring): load Sentry lazily and turn off its PII collection` | Dos builds comparados: sin DSN el SDK no existe en `dist/`; con DSN aparece en un chunk propio y el inicial casi no cambia |
| T0.7, T0.8 | `33e684d` `ci(setup): add the verification pipeline and SPA rewrites for Vercel` | `HUSKY=0 npm ci` (625 paquetes, lockfile sin drift) + typecheck + lint + 6/6 tests + build |
| T0.7b | `d90b2ae`, `bd72725` `docs(setup): ship the environment template and close T0.7` | `env.example` presente, no ignorado por git, contrato documentado en `README.md` |
| T2.4 | `29488d2` `feat(shell): add the router, app shell and bottom navigation` | typecheck + lint + 15/15 tests (rutas lazy, 404, orden y `aria-current` de la nav) + build + smoke test con `vite preview` sobre el artefacto real |
| Revisión visual de T2.4 | `7112d49` `chore(review): add screenshot capture and objective UI audit` | 20 combinaciones ruta×viewport medidas: sin overflow horizontal, nav de 62px sin tapar contenido, target mínimo de 61px, contraste de texto muted 5.71:1 y del tab activo 8.14:1, Inter resuelta |
| Hallazgo de la revisión visual | `66f74b4` `fix(a11y): signal the active tab without relying on colour` | Indicador visible verificado en browser real: exactamente uno por ruta y viewport, siempre el mismo que lleva `aria-current`; 17/17 tests |
| T3.1–T3.3 | `4a5551b` `feat(offline): give the query cache a durable, resumable mutation queue` | 25/25 tests en 6 archivos, con 5 dedicados a la cola: pausa offline, el caso `retry: 0` que no se persiste, supervivencia a persist+restore, reanudación al volver la conexión, y ausencia de `mutationFn` en la mutación restaurada |
| Mudanza a OneDrive | `641043c` `chore(repo): move the project to OneDrive with node_modules kept out of sync` | SHA-256 de 313 archivos idénticos antes de borrar el origen; typecheck, lint, 25/25 tests y build verdes desde la ruta nueva |
| T1.1/T1.2/T1.4 + A9 | `aplicado a la base hosted` | `db push --linked --include-seed` aplicó `0001`, `0002` y el seed sin errores · **A9 detectado en vivo** (`42501`) y corregido con `0003_grants.sql` · `gen types --linked` generó 451 líneas y el typecheck quedó limpio · `anon` no puede ejecutar `save_workout` (A3 verificado en vivo) |

### Desviaciones de Fase 0 (documentadas, no ocultas)

- **Delegación no disponible.** El harness rechaza `repository_root` y `workspace_root` para este proyecto porque `C:\Users\ulise` sigue siendo un repo git (0 commits, sin remoto), así que GymTracker queda anidado. El usuario eligió no tocar el home: **T0.1–T0.4 se hicieron inline**, contra la preferencia de delegar. Queda como deuda de proceso hasta que se elimine ese `.git` o se mueva el proyecto.
- **ESLint 10, no 9.** Se instaló el major vigente; `typescript-eslint` 8.71 y los plugins de React declaran soporte `^9 || ^10`. El plan §2 quedó corregido a 10.
- **Majors más nuevos que los del plan original**: React Router 8 (era 7), zod 4 + `@hookform/resolvers` 5 (eran 3), `date-fns` 4, `motion` 14, `@sentry/react` 11, `vitest` 5, `vite-plugin-pwa` 2, Vite 8, TypeScript 6. El bloque de dependencias del plan ahora lista las versiones reales.
- **Vitest sin `globals`**: los tests importan `describe/it/expect` de `vitest` para que el typecheck de producción no vea globals de test. Se aparta de "globals enabled" del brief original.
- **`typecheck` es `tsc -b`** (project references con `noEmit` en cada tsconfig), no `tsc -b --noEmit`.
- **`react-router-dom` → `react-router`**: el paquete canónico en v7+.
- **Sentry v11 cambió la API de privacidad.** La opción de la era de diseño, `sendDefaultPii`, ya no existe: v11 usa un objeto granular `dataCollection`. Lo atrapó el typecheck; en runtime habría sido un no-op silencioso y la app habría mandado más datos de los previstos.
- **`.env.example` entregado como `env.example`.** La política de seguridad del harness bloquea la ruta con punto de forma incondicional, incluso después de que el usuario autorizara explícitamente el archivo con valores vacíos. Se usó el nombre sin punto; el archivo documenta el motivo.
- **Advertencia interna del plugin PWA.** `vite-plugin-pwa` v2 emite un aviso de deprecación de Vite 8 sobre su propio uso de `inlineDynamicImports`. Es interno del plugin: no hay acción posible desde este repo.
- **Iconos SVG en vez de emojis.** El plan §6 Fase 2 listaba `🏠 🏋️ 📊 👤`. Se usan SVG en línea: los emojis renderizan distinto según el sistema operativo y no heredan `currentColor`.
- **Transiciones con Motion pospuestas.** T2.4 pedía transiciones; Motion queda fuera del bundle inicial y no había nada que animar todavía. Se retoma cuando exista navegación con contenido real.
- **Dos defectos de infraestructura de tests, encontrados acá.** (1) Testing Library solo auto-registra su `cleanup` cuando los globals de test están habilitados; con `globals` apagado el DOM se acumulaba entre tests y las queries por rol empezaron a encontrar duplicados. Ahora `vitest.setup.ts` lo cablea explícitamente. (2) Los matchers de jest-dom estaban registrados en runtime pero eran invisibles para TypeScript, porque el setup pertenece al programa Node y los tests al programa de la app; `src/testing.d.ts` trae la augmentación al programa correcto.
- **El agente no puede ver imágenes.** El modelo de esta sesión no procesa PNG, así que la revisión visual se hizo en dos frentes: `scripts/ui-audit.mjs` mide de forma objetiva (contraste WCAG desde los colores renderizados, tamaño de targets, solapamiento con la nav, overflow a 320/360/428/1280, si la fuente autoalojada ganó) y un subagente `gentle-ai-explore` con modelo que sí procesa imágenes describió las capturas de `scripts/capture-screens.mjs`. La combinación es la que encontró el defecto del estado activo; ninguna de las dos alcanzaba sola.

### Presupuesto de bundle — seguimiento medido

El plan §7 fija 180 KB gzip para el bundle inicial, con la regla de **medir, no asumir** (A8). Serie medida hasta ahora:

| Momento | JS inicial (gzip) | Qué entró |
|---------|-------------------|-----------|
| Scaffold (T0.1–T0.4) | 68.85 kB | React + ReactDOM + Tailwind |
| PWA (T0.5) | 69.87 kB | registro del SW + `virtual:pwa-register` |
| Router y shell (T2.4) | 100.47 kB | React Router 8: ~30.5 kB gzip |
| Cola offline (T3.1–T3.3) | **109.37 kB** | TanStack Query + persisters + idb-keyval: ~8.9 kB gzip |

Con 109.37 kB consumidos y **~71 kB de margen**, Zod + React Hook Form + Supabase (~73 kB estimados) ya **no entran**. **DECISIÓN TOMADA (2026-10-11): el presupuesto se mantiene en 180 kB y se mitiga.** Obligatorio a partir de acá: (1) los tres formularios de auth son rutas diferidas, con Zod y RHF en el chunk de cada pantalla; (2) **el cliente de Supabase no entra al bundle inicial** — se accede por un `getSupabase()` asíncrono con singleton perezoso, porque la primera pintura no lo necesita; (3) Sentry ya está fuera por import dinámico; (4) se vuelve a medir con el visualizer al cerrar cada fase y, si no entra, se reporta la cifra exacta antes de decidir otra cosa.

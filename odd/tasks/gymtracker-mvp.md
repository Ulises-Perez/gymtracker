# GymTracker MVP — Tareas ODD

**Estado:** Fases 0, 1 y 2 cerradas. **Fase 3 en curso**: T3.1b/c, T3.2b, T3.2c, T3.2d, T3.4, T3.5, T3.6a, T3.7a, T3.7b y T1.9 cerradas (184/184 tests en 25 archivos, bundle inicial 113.84 kB de 180). La suite pgTAP completa corre **en verde contra la base hosted (3 archivos, 49 aserciones)**, así que la policy de `exercises` quedó verificada por dos caminos (`L16`). La verificación independiente de la durabilidad corrió y su defecto alto quedó corregido (`L10`). D2 se resuelve dentro de T3.9. T2.5 bloqueada. Todo el trabajo se rutea por ODD (ver `L6`).
**Repo:** `C:\Users\ulise\OneDrive\Documentos\Pogramming\JS\React\GymTracker`, rama `feat/gymtracker-mvp`, repo propio. `node_modules` es un junction a `C:\Users\ulise\develop\gymtracker-modules\node_modules`.
**Specs:** los `S#` citan **verbatim** `PLAN.md` §1, §3, §6, §7 y §9, que es la fuente de requisitos declarada en `L1`. Los pedidos del usuario, las decisiones y la evidencia están en el `## Log`, al final.

---

## Specs

Cada `S#` es una cita textual del requisito: no se resume, no se parafrasea y no
se agrega nada que el usuario no haya pedido. Un cambio de requisito agrega su
entrada verbatim al `## Log`, reescribe **solo** los `S#` afectados y reabre
**solo** su tarea.

### Alcance

- **S1 · Qué es y qué no es.** "GymTracker es una PWA mobile-first multi-usuario para: 1. Registrar entrenamientos diarios (ejercicios × series × reps × peso), **incluso sin señal**. 2. Detectar PRs automáticamente (1RM estimado Epley). 3. Visualizar progreso por ejercicio (peso máx, volumen, 1RM)." No-objetivos, textuales: "Social / compartir / amigos. Rutinas generadas con IA. Push notifications como dependencia funcional. Pagos / suscripciones. i18n".
- **S16 · Idioma de la interfaz.** "errores en español" (Fase 2) y "Skeletons + errores claros en español" (checklist go-live). Skeletons, nunca spinners.

### Definiciones de terminado, por fase

- **S2 · Fase 0.** "DoD: `npm run dev` corre en `:5173`, CI verde, `.env.example` presente."
- **S3 · Fase 1.** "DoD: `supabase db reset` levanta local con catálogo, tipos generados, test RLS en verde."
- **S4 · Fase 2.** "DoD: registro → login → ruta protegida → logout funciona en 360px."
- **S5 · Fase 3 — la prueba que la define.** "DoD: workout completo registrado **con wifi apagado**, sincronizado al volver la red, con animación de PR. E2E Playwright en verde."
- **S7 · Fase 4.** "DoD: lista paginada + detalle workout + gráfica real de 1 ejercicio."
- **S8 · Fase 5.** "DoD: una llamada `dashboard_summary()` pinta todo; prefetch en background."
- **S9 · Fase 6.** "DoD: cambiar kg/lb no altera ningún dato histórico; CSV descarga."
- **S10 · Fase 7.** "DoD: Lighthouse 90+ en las 4 categorías, instalable Android+iOS, URL pública sin errores en Sentry."

### El flujo de la Fase 3, textual

- **S6 · La pantalla de entrenamiento.** "[+ Nuevo Workout] → título opcional → [+ Agregar Ejercicio] → modal (🔍 fuse + filtro por grupo) → tarjeta por ejercicio → series (reps × kg, ref "último: …") → [+ serie] / swipe-delete → reorder (dnd-kit) → timer descanso → [✅ Finalizar] → 🎉 PRs"

### Las garantías offline y de datos

- **S12 · IDs generados en cliente.** "`uuidv7()` de `uuid@^9` en cliente para workouts/sets/custom; `gen_random_uuid()` como default servidor (Postgres no genera v7 nativo). `crypto.randomUUID()` **no sirve: es v4**".
- **S13 · La cola de mutaciones tiene que ser real.** "`networkMode: 'offlineFirst'` **en queries y en `defaultOptions.mutations`** + **`retry` > 0** + `persistQueryClient` con persister IndexedDB y `dehydrateOptions.shouldDehydrateMutation`." Y el requisito que el plan reconoce en su sección de limitaciones: "La cola solo es reanudable si el cliente aporta un `mutationFn` por defecto que despache según el payload. Y como `MutationFunction` recibe únicamente las variables (no la `mutationKey`), **el payload tiene que ser autodescriptivo**: unión discriminada con `kind`."
- **S17 · La ventana de pérdida de escritura.** "Ventana de pérdida antes de que la escritura sea durable. El retryer duerme el `retryDelay` **antes** de consultar si puede continuar y pausar, y el persister además tiene su propio throttle. Con el backoff por defecto (~2 s en el primer reintento) más el throttle (~1 s), una escritura offline tarda del orden de dos a tres segundos en quedar en disco: si el usuario cierra la pestaña en esa ventana, se pierde. Mitigación prevista: forzar un flush del persister en `pagehide`/`visibilitychange: hidden`."
- **S14 · Guardado atómico.** "Un solo RPC `save_workout(payload jsonb)`: workout + sets + PRs en una transacción"
- **S15 · Decimales parseados en un solo lugar.** "Las columnas `DECIMAL` (`weight_kg`, `best_1rm`, `total_volume`) vuelven como **string** desde supabase-js. Todo pasa por `src/lib/utils.ts`: nunca concatenar ni llamar `.toFixed()` sobre el valor crudo"

### Rendimiento

- **S11 · Presupuesto de bundle.** "Presupuesto: decisión del 2026-10-11 — se mantiene en 180 KB gzip", con estas cuatro mitigaciones, todas obligatorias: "1. **Los tres formularios de auth son rutas diferidas.** Zod y React Hook Form viajan en el chunk de cada pantalla, nunca en el inicial. 2. **El cliente de Supabase no entra al bundle inicial.** Se accede por un `getSupabase()` asíncrono con singleton perezoso; la primera pintura no lo necesita y la comprobación de sesión puede esperarlo. 3. **Sentry ya está fuera** por import dinámico (T0.6). 4. **Se vuelve a medir al cerrar cada fase** con `rollup-plugin-visualizer`, y si el número no entra se reporta con la cifra exacta antes de tomar cualquier otra decisión."

---

## Tasks

Una línea por tarea: ID, `S#` vinculado, ruta de ejecución y commit con el que cerró.
El detalle de cada tarea —hallazgo, decisión, evidencia— está inmediatamente
después, y es lo que un subagente lee cuando se le despacha
`Spec: odd/tasks/gymtracker-mvp.md, <Tarea>, <S#>`.

| Tarea | S# | Ruta | Commit |
|-------|----|------|--------|
| T0.1 · repo aislado + `.gitignore` + scaffold Vite/React/TS en el root | S2 | inline | `813f501` |
| T0.2 · TS strict + ESLint/Prettier/Husky/lint-staged | S2 | inline | `813f501` |
| T0.3 · Tailwind v4 + tokens de diseño | S2 | inline | `813f501` |
| T0.4 · dependencias completas (incluidas las de A7) | S2 | inline | `813f501` |
| T0.5 · PWA `injectManifest` en modo prompt + `src/sw.ts` | S2 | inline | `6cdd7c0` |
| T0.6 · Sentry por import dinámico, sin PII, solo en PROD | S11 | inline | `3960d76` |
| T0.7 · CI `lint → typecheck → test → build` + `vercel.json` | S2 | inline | `33e684d`, `d90b2ae` |
| T0.8 · medición y presupuesto de bundle | S11 | inline | `33e684d` |
| T1.1 · B1 (`recent_prs`) y A3 (`REVOKE`) en el baseline | S3 | hosted | aplicado a la base |
| T1.2 · A1 (policy de Storage sobre `storage.foldername`) | S3 | hosted | aplicado a la base |
| T1.3 · guard de integridad A2 (FK compuesto) | S3 | hosted | `14ad965` |
| T1.4 · `supabase init`, proyecto hosted, migraciones, tipos | S3 | hosted | aplicado a la base |
| T1.5 · seed: grupos vacíos + idempotencia | S3 | hosted | `176b5a6` |
| T1.6 · suite pgTAP de schema, RLS y GRANTs | S3 | hosted | `8260fb5` |
| T1.7 · tests de `save_workout` con harness de impersonación | S3, S14 | hosted | `16432c4` |
| T1.8 · limitaciones M1/M6 + `deleted_at` en `body_measurements` | S3 | hosted | `d884544` |
| T2.1 · `getSupabase()` perezoso, SDK fuera del inicial | S4, S11 | inline | `c398990` |
| T2.2 · `AuthProvider` + `useAuth` + `RequireAuth` | S4 | inline | `7f58d3d` |
| T2.3 · cuatro pantallas de auth como rutas diferidas | S4, S16 | inline | `10df839` |
| T2.4 · shell + BottomNav + skeletons | S4, S16 | inline | `29488d2`, `7112d49`, `66f74b4` |
| T2.5 · registro contra el servidor real | S4 | **bloqueada** | pendiente |
| T1.9 · policy de SELECT de `exercises` expone custom ajenos | S3 | hosted | `97a732f` |
| T3.1 · `AsyncStorage` sobre IndexedDB compartido | S13 | inline | `4a5551b` |
| T3.1b · `useWorkoutStore` (Zustand + persist) con guard de doble finish | S13 | inline | `19573de` |
| T3.1c · `localIsoDate()` (fecha del reloj local) | S13 | inline | `19573de` |
| T3.2d · la cola restaurada se reanuda aunque ya estuviera online (D1) | S13 | inline | `0fe09be` |
| T3.2 · QueryClient offline-first + persister IndexedDB | S13 | inline | `4a5551b` |
| T3.2b · dispatcher de reanudación + `save-workout` | S13 | inline | `1ef4b8a` |
| T3.2c · ventana de pérdida: pausa inmediata + flush sin timers | S17 | inline | `f4c7abd` |
| T3.3 · IDs v7 en cliente | S12 | inline | `4a5551b` |
| T3.4 · catálogo en TQ + IndexedDB + mapeo de decimales | S15, S6 | inline | `e1187e5` |
| T3.5 · selector modal Radix + fuse + filtro por grupo | S6 | inline | `4d1a8bd` |
| T3.6a · tarjeta de ejercicio: inputs reps × peso + defaults | S6 | inline | `716e3e7` |
| T3.6b · swipe-delete + reorder de ejercicios (dnd-kit) | S6 | pendiente | — |
| T3.7a · `durationMinutes` (M3) + `useRestTimer` por `endTimestamp` | S6 | inline | `0d2a213` |
| T3.7b · Screen Wake Lock durante el entrenamiento | S6 | inline | `3596be2` |
| T3.8 · ejercicio custom local → sync en `save_workout` | S6 | pendiente | — |
| T3.9 · Finalizar → PRs + animación + badge de sync | S5, S6, S14 | pendiente | — |
| T3.10 · E2E Playwright del flujo crítico | S5 | pendiente | — |
| T4.1 · lista `useInfiniteQuery` con paginación keyset | S7 | pendiente | — |
| T4.2 · detalle de workout y de ejercicio | S7 | pendiente | — |
| T4.3 · uPlot lazy sobre `exercise_progress` | S7, S11 | pendiente | — |
| T4.4 · toggle kg/lb solo UI + helper de soft-delete | S7, S15 | pendiente | — |
| T4.5 · borrar workout / historial | S7 | pendiente | — |
| T5.1 · `dashboard_summary()` en una llamada | S8 | pendiente | — |
| T5.2 · skeletons + prefetch de historial y catálogo | S8, S16 | pendiente | — |
| T6.1 · nombre, avatar, unidad preferida | S9 | pendiente | — |
| T6.2 · stats derivadas + peso corporal | S9 | pendiente | — |
| T6.3 · "Repetir workout" + export CSV + logout | S9 | pendiente | — |
| T7.1 · manifest + iconos maskable + splash iOS | S10 | pendiente | — |
| T7.2 · SW: precache shell, nunca cachear auth ni escrituras | S10 | pendiente | — |
| T7.3 · prompt de instalación Android + instrucciones iOS | S10 | pendiente | — |
| T7.4 · Lighthouse 90+ ×4 y medición de controles de formulario | S10, S11 | pendiente | — |
| T7.5 · deploy Vercel + e2e en dispositivo real + README | S10, S5 | pendiente | — |

### Detalle por tarea


Convención: `[ ]` pendiente, `[x]` cerrada con evidencia. Cada tarea cierra con al menos un commit de work-unit en la rama de feature.

#### Fase 0 — Setup + CI

- [x] **T0.1** (D1) Repo aislado + `.gitignore` + `.gitattributes` + scaffold Vite 8 / React 19 / TS 6 **en el root del repo**. `create-vite` pide confirmación en un directorio no vacío, así que se generó en un directorio temporal fuera del repo y se copió: `PLAN.md`, `odd/`, `supabase/`, `.gitignore` y `.gitattributes` intactos. Sobrantes del template (oxlint, `icons.svg`, `App.css`, assets demo) eliminados. Verificado en `813f501`.
- [x] **T0.2** TS `strict` + `noUncheckedIndexedAccess`; ESLint 10 flat config (`typescript-eslint` + react-hooks + react-refresh) + Prettier + Husky v9 + lint-staged. El hook se probó en el propio commit `813f501` (lint-staged corrió `eslint --fix` y `prettier --write` y stageó los cambios).
- [x] **T0.3** Tailwind v4 vía `@tailwindcss/vite` + tokens de diseño §5 en `src/index.css` (`@theme`); `backdrop-filter` restringido a `.bottom-nav` y `.overlay`.
- [x] **T0.4** Dependencias completas, incluidas las faltantes de A7 (`uuid` 14 —`v7()` disponible—, Radix Dialog/Toast, `@playwright/test`, `@testing-library/jest-dom`, `jsdom`).
- [x] **T0.5** PWA con `strategies: 'injectManifest'`, `src/sw.ts` propio y `registerType: 'prompt'`: el worker nuevo no se activa hasta que el usuario acepte (`SKIP_WAITING` explícito), así una actualización no recarga la app en medio de una serie. `tsconfig.sw.json` compila el worker con `lib: WebWorker` y `tsconfig.app.json` lo excluye, evitando el conflicto de identificadores duplicados entre DOM y WebWorker. **Dos defectos de precache encontrados al verificar el manifiesto generado**: `stats.html` (el reporte del visualizer) se estaba precacheando, y `woff2` no estaba en los globs por defecto, así que el shell habría renderizado offline con fuentes de fallback. Corregido: el reporte ahora se escribe en `stats/` (fuera de `dist/`) y los globs incluyen `woff2` y excluyen los subsets cirílico, griego y vietnamita. Precache final: 8 entradas / 366.18 KiB.
- [x] **T0.6** Sentry por import dinámico, solo en `PROD` y solo si hay `VITE_SENTRY_DSN`, invocado después del primer render. Verificado por partida doble: **sin** DSN el SDK se elimina por completo del build (Vite inlinea la variable como `undefined`, el guard queda estáticamente verdadero y Rollup borra el import dinámico); **con** DSN queda en un chunk aparte de 30.78 kB gzip y el inicial crece apenas de 69.87 a 70.27 kB gzip. Además se desactivó la recolección de PII (`dataCollection`), porque la app guarda peso corporal e historial.
- [x] **T0.7** CI en GitHub Actions (`lint → typecheck → test → build`, con caché de npm, `HUSKY=0` y grupo de concurrencia) + `vercel.json` con rewrite de todas las rutas a `/index.html` y `Cache-Control` de revalidación para `/sw.js` (un SW cacheado de más hace que el prompt de actualización nunca dispare). Pipeline validado ejecutando `HUSKY=0 npm ci` real: 625 paquetes desde el lockfile sin drift. **Plantilla de entorno entregada como `env.example`**: la ruta convencional `.env.example` está bloqueada de forma incondicional por la política de seguridad del harness (rechaza escrituras a `.env*` y no acepta autorización en conversación), así que el archivo salió sin el punto inicial, lo explica en su encabezado y renombrarlo es un solo comando. El contrato de variables quedó además documentado en `README.md` y tipado en `src/vite-env.d.ts`.
- [x] **T0.8** Bundle final medido: **JS inicial 69.87 kB gzip** (222.63 kB raw), **CSS 3.36 kB gzip**, chunk aparte de `workbox-window` 2.20 kB gzip, `index.html` 0.39 kB gzip, y el SDK de Sentry (30.78 kB gzip) fuera del inicial cuando hay DSN. Precacheados solo los subsets latinos de Inter. Presupuesto de referencia 180 kB gzip: el margen se sostiene, pero todavía no entraron router, TanStack Query, Supabase ni los gráficos.

#### Fase 1 — Schema + RLS + Seed

- [x] **T1.1** (D3) B1 (`recent_prs`) y A3 (`REVOKE`) aplicados en el baseline y **verificados en vivo**: `save_workout` responde `42501 permission denied for function` a `anon`, o sea que el `REVOKE` hace efecto.
- [x] **T1.2** (D3) A1 aplicado en el baseline. `0001_init.sql` corrió contra la base hosted **sin errores**, incluidos el `INSERT` en `storage.buckets` y la policy sobre `storage.objects`.
- [x] **T1.3** Guard de integridad A2 (`workout_sets.user_id` ≡ `workouts.user_id`). Resuelto de forma declarativa en `0004_workout_sets_owner_integrity.sql`: `UNIQUE (id, user_id)` en `workouts` + FK compuesto `(workout_id, user_id) → workouts (id, user_id)`, que reemplaza al FK de una sola columna. El motor lo impone en todo INSERT/UPDATE, sin depender de que el camino pase por `save_workout`. Verificado en vivo y por aserción (forma del FK, no solo su nombre).
- [x] **T1.4** (D2) `supabase init` hecho (`config.toml`), proyecto hosted linkeado (`wcurruszasxgxzimlbdk`, **región `sa-east-1`**, Postgres 17.11, `ACTIVE_HEALTHY`), `0001`+`0002`+`0003` aplicadas con el seed cargado, y **tipos generados** en `src/types/database.ts` (451 líneas, las 7 tablas y las 4 RPC; typecheck limpio).
- [x] **T1.5** Seed: cubrir `Glúteos` y `Cuerpo Completo` (M5). **Cerrada**: `Hip Thrust` movido de `Piernas` a `Glúteos` y 9 ejercicios nuevos (4 más de glúteos, 5 de cuerpo completo) → **57 globales**. El seed pasó a ser **idempotente** (`ON CONFLICT DO NOTHING` contra `ux_exercises_global_name`, migración 0005) y se aplicó con `db query -f` (ver H4). Verificado contra la base: 57 globales, 0 grupos vacíos, `Piernas` 8, `Cuerpo Completo` 5, un solo `Hip Thrust`.
- [x] **T1.6** Suite pgTAP en `supabase/tests/0001_schema_test.sql`: **21 aserciones, ejecutadas contra la base real, 21/21 en verde**. Cubre seed (incluido M5), RLS habilitado en las 6 tablas, los GRANTs de tabla y de función (A9/A3), el FK compuesto (A2), `deleted_at` y el índice parcial (M4) y el índice único del catálogo (M5). Tres defectos que solo aparecían ejecutando (H1–H3) más dos hallazgos del CLI (H4–H6).
- [x] **T1.7** Tests de `save_workout` en `supabase/tests/0002_save_workout_test.sql`: **20 aserciones** contra la base real (41/41 con el archivo de schema). Cubre Epley (`100 kg × 5 → 116.67`), PR que no baja (A4), warmups excluidos del PR pero guardados en el historial, reintento con los mismos UUID sin duplicar, reemplazo completo de series (sin merge), `Forbidden` al pisar un workout ajeno — sin tocar sus datos —, `Not authenticated` sin claims, y **RLS real**: B no ve los workouts de A, que es el harness que pedía A6 (`authenticated` + claims, no `service_role`, que bypassea RLS). Todo dentro de una transacción con rollback: verificado que no quedan usuarios ni workouts de prueba en la base.
- [x] **T1.8** Documentar limitaciones M1/M6 y agregar `deleted_at` a `body_measurements` (M4). **Cerrada**: `0006_body_measurements_soft_delete.sql` agrega `deleted_at` y reemplaza `UNIQUE(user_id, date)` por un índice único **parcial** sobre filas vivas — sin ese detalle, borrar una medición bloquearía volver a cargar el mismo día. M1, M6 y A4 quedaron documentados en el README ("Limitaciones conocidas del MVP").
- [x] **T1.9** **La policy de SELECT de `exercises` exponía filas custom de otros usuarios.** Hallazgo propio, no de la verificación. **Cerrada** (`97a732f`) con la decisión del usuario de corregirla **y aplicarla al proyecto hosted**. `0001_init.sql:74-75` era `ON public.exercises FOR SELECT USING (true)` y `0003_grants.sql:26` da `GRANT SELECT` a `authenticated`, así que cualquier usuario autenticado leía **todas** las filas, incluidas las de `is_custom = true` ajenas: `name`, `description`, `created_by`. El plan solo pedía que el catálogo **global** fuera compartido; leer los custom ajenos lo contradecía. La suite pgTAP no lo cubría: probaba que A no lee los *workouts* de B, nunca los ejercicios custom de B. Fix: `0007_exercises_select_scope.sql` dropea y recrea la policy con el invariante real (`COALESCE(is_custom, false) = false OR created_by = (select auth.uid())`); el `COALESCE` no es decorativo, porque `is_custom = false` **no** matchea NULL y habría dejado invisibles las filas globales insertadas sin la columna explícita — un arreglo peor que el bug. Aplicada con `db push --linked` después de confirmar con `migration list --linked` que era la única pendiente. Ver la evidencia de la migración en `L11` y el cierre de la deuda del pgTAP, con la suite entera en verde (49/49), en `L16`.

**Aprendizaje operativo de la Fase 1**: `db push` y `gen types --linked` funcionan contra el proyecto hosted **sin Docker**, pero `test db --linked` y `db dump --linked` **lo requieren igual** (corren `pg_prove`/`pg_dump` en un contenedor). Elegir hosted en D2 no nos libra de necesitar el daemon para verificar RLS.

**Agregado 2026-10-12**: `db query --linked` (SQL arbitrario como `postgres`) tampoco necesita Docker y es la vía tanto para DML suelto como para aplicar el seed. Y **no correr dos comandos del CLI contra la base en paralelo**: `test db` junto con `db query` se colgó (el CLI rota la contraseña del rol temporal en cada corrida); secuencial siempre.

#### Fase 2 — Auth + Shell

- [x] **T2.1** `src/lib/supabase.ts`: **`getSupabase()` asíncrono con singleton perezoso**. El SDK entra por `import()` dinámico, así que la primera pintura no paga por él — medido con y sin consumidor: el inicial pasa de **107.98 a 108.16 kB gzip** (+176 B, el wrapper) y el SDK de Supabase (**54.5 kB gzip**) queda en un chunk aparte. `persistSession` + `autoRefreshToken` + `detectSessionInUrl` (los links de confirmación y recuperación vuelven con los tokens en el fragmento de la URL). Cinco tests: pereza (nada se crea al importar el módulo), singleton (una sola creación aunque se lo llame en paralelo), la URL/key/opciones que recibe el SDK, y los dos errores que nombran la variable faltante. Los tests stubean el entorno: no dependen de `.env`, que en CI no existe. Nota: ese chunk queda precacheado por el SW (14 entradas / 705 KiB en el build con consumidor), coherente con offline-first.
- [x] **T2.2** `AuthProvider` + `useAuth()` + `RequireAuth` (`7f58d3d`). El contexto expone `session`, `user`, `loading` y `signIn`/`signUp`/`signOut`; `signUp` manda `full_name` como metadata, que es de donde `handle_new_user` llena el perfil. Dos fuentes alimentan el estado y ninguna sobra: `onAuthStateChange` (login, logout, refresh de token y otras pestañas sin recargar) y `getSession()` (responde desde storage sin esperar un evento); **gana la primera que conteste**, así que una lectura lenta no pisa una sesión ya reportada. `RequireAuth` cuelga el shell entero de **una sola ruta sin path**: con la sesión desconocida muestra el esqueleto (no redirige — decidir temprano rebotaría a `/login` en cada recarga) y sin sesión manda a `/login` **con el destino original en el `state`**, para que la pantalla de login pueda devolver al usuario donde iba. 12 tests nuevos con un doble de `getSupabase()` en `src/testing/fake-supabase.ts` (peraza, sesión guardada, eventos, la carrera lectura-vs-evento, desuscripción al desmontar, errores de Supabase, metadata de `signUp`). **Desviación menor**: el context vive en `src/providers/auth-context.ts` y el provider en `AuthProvider.tsx` porque exportar ambos desde el mismo archivo rompía Fast Refresh (`react-refresh/only-export-components`). Verificación en navegador pendiente: llega con T2.3, cuando exista `/login`; acá lo verificado es el comportamiento del gate y el presupuesto.
- [x] **T2.3** Pantallas de auth como rutas diferidas: **Login, Registro, Recuperar y Nueva contraseña** (`<hash>`). La cuarta la aprobó el usuario: el link de recuperación vuelve con una sesión de tipo `recovery`, así que sin una pantalla que llame a `updateUser({ password })` el circuito quedaba abierto. Zod + React Hook Form viven en `auth-*.js` (**34.59 kB gzip**), que se descarga solo al abrir una ruta de auth; el inicial no los paga. Los errores de Supabase se mapean a español por `code` (con el `message` como respaldo para servidores viejos y un genérico para lo desconocido), y cada pantalla muestra su error con `role="alert"`.
  - **Hallazgo real, medido**: el texto del botón primario daba **4.28:1** sobre `#6c5ce7`, por debajo del 4.5 de AA. Corregido con blanco puro en los botones → **4.86:1** verificado en el navegador. Es la única desviación de los tokens del plan y está comentada en el componente.
  - **Logout adelantado**: el DoD de la fase lo pide y el plan lo ubicaba en Fase 6, así que `ProfilePage` ya tiene su botón "Salir" con test.
  - **Verificación en navegador**: `scripts/ui-audit.mjs` extendido a las rutas de auth → **36 mediciones (9 rutas × 4 viewports), 0 hallazgos** (overflow, contenido tapado, fuente, contraste: h1 17.39, muted 5.71). Después, un script temporal en `stats/` (gitignoreado) corrió el flujo autenticado real a 360px: **12/12**, con nav de 62px y destino mínimo de 61px.
  - **Cómo se verificó sin buzón**: el proyecto exige confirmar el email (`mailer_autoconfirm: false`) y Supabase **rechaza dominios sin MX** (`example.test` → `email_address_invalid`, que la app mapea bien). El usuario de prueba se creó con el **signup real** contra un dominio descartable y se confirmó con un solo `update auth.users set email_confirmed_at = now()`. **Lección**: un usuario insertado a mano en `auth.users` **no sirve** — a GoTrue le falta lo que él mismo escribe (y con las columnas de token en NULL responde 500 "Database error querying schema"). Queda como deuda cerrar esa milla con un email entregable o desactivando la confirmación en el proyecto de dev.
  - **Deuda anotada para T7.4**: el audit de UI no mira controles de formulario; el alto (48px ✓) y el contraste del botón (4.86:1 ✓) los midió el script temporal.
- [x] **T2.4** Shell + BottomNav + skeletons, sin spinners — **cerrada salvo las transiciones con Motion**, que se posponen para no meter la librería en el bundle inicial. Entregado: `src/app/routes.tsx` (React Router 8 con cada ruta en su propio chunk lazy), `src/app/router.tsx`, `src/App.tsx`, `AppShell` (columna única, skip-link, padding que reserva la nav fija), `BottomNav` (4 destinos, `aria-current` vía `NavLink`, `end` en la raíz), `Skeleton`, `PagePlaceholder` y los 5 placeholders de ruta. **Iconos SVG en línea en vez de los emojis del plan**: los emojis renderizan distinto en cada plataforma y no heredan el color del texto, así que no pueden formar parte de un sistema de diseño. Verificado: 15 tests en 4 archivos + smoke test del build servido (`/`, `/history`, `/profile`, `/sw.js`, `/manifest.webmanifest` → 200, y `/history` devuelve el shell HTML, que es el fallback SPA que `vercel.json` debe reproducir).

- [ ] **T2.5** Cerrar la milla que quedó del registro contra el servidor real. Hoy está verificado que el **signup real** funciona contra un dominio que el servidor acepta, que `handle_new_user` crea el perfil y que el login devuelve token; lo que falta es la pantalla **"Revisá tu correo"** con el servidor (hoy solo está cubierta con dobles). **Bloqueada por dos cosas del proyecto**: exige confirmar el email (`mailer_autoconfirm: false`) y hay que esperar a que se recupere el rate limit de envíos (varios signups de diagnóstico lo consumieron). Caminos: un email entregable del usuario, o desactivar la confirmación en el proyecto de dev. Técnica al retomar: signup real + `update auth.users set email_confirmed_at = now()` — un usuario **insertado a mano no sirve** (GoTrue no valida el hash y con las columnas de token en NULL responde 500).

#### Fase 3 — Workout Core (offline-first) ⭐

- [x] **T3.1** (parcial) `src/lib/storage.ts` con un `AsyncStorage` sobre IndexedDB compartido por el persister y —más adelante— Zustand, porque ambos contratos exponen los mismos tres miembros. Falta el `useWorkoutStore` en sí.
- [x] **T3.1b** `useWorkoutStore`: Zustand + `persist` sobre IndexedDB, con el guard de doble finish. **Cerrada** (`19573de`). El draft (`workoutId`, `date`, `title`, `notes`, `startedAt`, `endedAt`, `status`, `exercises[]` → `sets[]`) es el núcleo offline-first: la serie se registra acá y llega al servidor después. Los dos guards viven en **un solo helper `edit()`** en vez de repetirse en cada acción — sin draft abierto no hay cambio que aplicar, así que de ahí salen gratis las dos garantías: un segundo toque en Finalizar no puede mover `endedAt` (que es de donde salen la duración y el payload) y ninguna serie puede entrar después de que el payload se construyó, porque entonces el store y el servidor discreparían sobre lo entrenado. `start()` **no reemplaza** un draft abierto (perder una sesión por un segundo toque no se recupera); descartarlo es `discard()`, que la pantalla decide con el usuario. Un draft **terminado** sí se puede reemplazar sin riesgo: lo que se iba a guardar ya quedó capturado como variables autodescriptivas en la cola, que es exactamente por lo que T3.2b exigió que el payload se describiera solo. `hydrated` distingue "no hay draft" de "todavía no lo leí": la lectura es asíncrona. `addSet` acepta un `seed` porque "igual que la última vez" es un dato que la UI pasa, no algo que el store deba ir a buscar. 18 tests. **Hallazgo propio**: `persist` **escribe en cada cambio de estado**, así que "olvidar" el draft en memoria para simular un reload lo **borra del disco**; el test tuvo que capturar los bytes, esperar la escritura del estado vaciado y recién entonces reponerlos.
- [x] **T3.1c** `localIsoDate()` en `src/lib/utils.ts`. **Cerrada** (`19573de`) con la misma tarea: la fecha del entrenamiento sale del reloj local. `new Date().toISOString().slice(0, 10)` es el atajo que parece equivalente y no lo es — la sesión de las 22:00 en Argentina queda fechada **mañana**, un error que solo aparece de noche y solo al oeste de UTC. 4 tests.
- [x] **T3.2** QueryClient con `offlineFirst` en queries y mutaciones, `retry: 3`, predicado de persistencia explícito (solo pausadas) y persister en IndexedDB; `PersistQueryClientProvider` restaura antes de renderizar. **Verificado moviendo la conexión**, no desconectando la red a mano: una escritura offline se pausa, sobrevive a persistir y restaurar en un cliente nuevo, y se reanuda al volver la conexión recibiendo sus variables.
- [x] **T3.2b** **Dispatcher de reanudación** (`defaultOptions.mutations.mutationFn`), requisito que el plan no tenía: sin él la mutación restaurada no tiene función que ejecutar (`No mutationFn found`). El payload debe ser autodescriptivo (unión discriminada con `kind`) porque `MutationFunction` recibe solo las variables, nunca la `mutationKey`. **Cerrada** (`1ef4b8a`): `src/lib/queued-mutations.ts` lee el `kind` con un guard deliberadamente **superficial** (afirma solo que el `kind` es ruteable, nunca que el payload sea válido: un guard que afirmara lo segundo sería inseguro y la mentira sería invisible hasta que un payload malo llegara a la base) y carga el handler por `import()` dinámico, así que Zod y el SDK de Supabase quedan en un chunk diferido (`workout-api` 0.45 kB, `schemas` 23.42 kB). `UnknownQueuedMutationError` nombra el `kind` que no pudo rutear. El primer kind real es `save-workout`, con el schema del payload en `src/schemas/workout.ts`. **Hallazgo propio del schema**: `id` y `date` son **obligatorios** aunque la RPC los complete sola (`gen_random_uuid()`, `CURRENT_DATE`) — esos dos defaults son justo los incorrectos para una cola: un workout anotado ayer offline y sincronizado hoy quedaría fechado hoy, y un id generado es un workout nuevo en cada reintento. Exigirlos convierte esas dos corrupciones silenciosas en un error de parseo. 6 tests nuevos.
- [x] **T3.2c** Cerrar la ventana de pérdida: el retryer duerme el `retryDelay` antes de pausar, así que una escritura offline tarda ~2-3 s en quedar en disco y se pierde si el usuario cierra la pestaña antes. Flush del persister en `pagehide` / `visibilitychange: hidden`. **Cerrada** (`f4c7abd`) con las dos mitades medidas por separado: (a) el `retryDelay` ahora es **0 mientras el browser ya sabe que está offline** y mantiene el backoff exponencial mientras está online (ahí la falla es transitoria y martillar el servidor es la respuesta equivocada), así que la pausa —y por lo tanto la persistencia— ocurre sin esperar; (b) `flushQueryCache()` escribe el **mismo sobre** que `persistQueryClientSave` directo a storage, sin timers, porque el persister envuelve su escritura en un `asyncThrottle` que duerme con `timeoutManager.setTimeout`: pedirle a un timer que dispare cuando la pestaña ya no está es pedir un no-op. `installPersistFlush()` cuelga `pagehide` (el último evento que emite una pestaña o PWA que se cierra) y `visibilitychange` cuando queda `hidden` (en mobile el backgrounding muchas veces no emite `pagehide`), y devuelve su propio teardown. 4 tests de wiring + 3 de timing/flush.
- [x] **T3.2d** **La cola restaurada se tiene que reanudar aunque la conexión ya estuviera arriba.** **Cerrada** (`0fe09be`), hallazgo **D1** de la verificación independiente (ver `L10`). `hydrate()` no reanuda nunca y `QueryClient.mount()` reanuda **solo dentro** de sus suscripciones de foco y de red, y ningún manager emite al suscribirse: solo registran listeners. Una escritura restaurada por una carga de página con la conexión sana quedaba pausada **indefinidamente**: durable en disco y sin guardar. Fix: `resumeQueuedMutations()` en `queryClient.ts` y `onSuccess` en `PersistQueryClientProvider`, el único momento que sabe que una cola acaba de volver del disco. El test fija las dos mitades — montar solo la deja pausada, el push la ejecuta — así que la razón del fix queda en la suite y no solo en un comentario.
- [x] **T3.3** Generación de IDs v7 en cliente (`src/lib/ids.ts`), con test de orden temporal por fake timers.
- [x] **T3.4** Catálogo en TQ + IndexedDB (`staleTime: Infinity`) + regla de mapeo de decimales (**A5**). **Cerrada** (`e1187e5`). `staleTime: Infinity` porque el selector tiene que abrirse al instante y sin señal: la query la persiste el persister que ya existía, y su `maxAge` de 7 días es lo que tarde o temprano la refresca — no un refetch al navegar. **La clave lleva el `userId`**, y eso es load-bearing: el catálogo incluye los ejercicios custom del usuario y el caché sobrevive a la sesión, así que en un dispositivo compartido una segunda cuenta no puede recibir la lista de la primera. `src/lib/catalog-api.ts` es el **límite de lectura**: ahí se renombran las columnas a camelCase y, sobre todo, ahí `DECIMAL` pasa a número (A5) — `weight_kg` vuelve como string desde supabase-js, así que la conversión se hace una vez, en el punto de lectura, en vez de confiar en que cada consumidor se acuerde. 12 tests nuevos, incluida la forma de la query (filtro de soft delete, alcance por dueño, orden), que no tiene otro observable. **Incluye `useLastSets`** sobre `last_weight_for_exercise`, que es el consumidor concreto que hace verificable A5 en vez de una promesa: solapa a propósito con T3.6, que ahora solo lo consume.
- [x] **T3.5** Selector modal Radix + fuse + filtro por grupo. **Cerrada** (`4d1a8bd`). `ExercisePickerDialog` sobre Radix Dialog + fuse.js, alimentado por el catálogo que T3.4 ya cachea, así que abrirlo sin señal es instantáneo; Radix aporta foco atrapado, escape, `aria-modal` y el portal, que es la razón de que sea dependencia. **La búsqueda foldea acentos**: `fuse.js` matchea caracteres, así que no sabe que "extension" y "Extensión" son la misma palabra, y nadie escribe la tilde a mitad de una serie en el teléfono; `normalizeForSearch()` se aplica a los dos lados. **El índice de fuse se construye sobre la lista ya filtrada por grupo**, no sobre el catálogo entero: es lo que impide que el filtro y el texto se contradigan — "press" dentro de Tríceps tiene que volver vacío, no traer Press Banca por la ventana de la búsqueda. **Los estados no se pueden confundir con "vacío"**: cargando son esqueletos con `role="status"` (nunca spinner), fallado es `role="alert"` en español (una lista vacía y una query denegada se ven idénticos en pantalla), y sin resultados y catálogo vacío tienen mensajes distintos. Los grupos **sin ejercicios no se ofrecen como filtro** — un chip que lleva a una lista vacía es peor que ningún chip, y la pantalla no le cree al dato (M5). El filtro activo va con `aria-pressed`, no solo color: la misma lección del tab activo de T2.4. 15 tests nuevos, RED observado. **Deuda de tooling**: `user-event` no está instalado y no se agregó a mitad de fase; los tests usan `fireEvent`.
- [x] **T3.6a** Tarjeta de ejercicio: inputs reps × peso con default = última serie (`last_weight_for_exercise`). **Cerrada** (`716e3e7`), partida de T3.6 (ver `L13`). La tarjeta **no tiene estado propio**: todo sale del draft que el store persiste y cada toque vuelve como callback, que es lo que hace que un entrenamiento a medio hacer sobreviva a un reload. Los dos defaults son la misma pregunta contestada dos veces (`seedForNextSet`): de la segunda serie en adelante, la serie de arriba —repetir el peso es el caso común y ahorra dos toques por serie—; la primera serie arranca donde quedó el ejercicio la última sesión. **El warmup no se hereda**, porque los calentamientos van primero. **Los campos son de texto con teclado decimal, no `type="number"`**: un input numérico rechaza la coma con la que acá se escriben los pesos y encima reporta valor vacío, así que el usuario ve desaparecer lo que escribe; son **no controlados** porque uno controlado reescribiría "72," a "72" a mitad de la pulsación y el dígito siguiente caería después del 72. Un campo vacío guarda `null`, **nunca 0**, porque `Number('')` es 0 y una serie salteada no es una serie de 0 kg. A11y: el nombre accesible incluye el número de serie ("Peso en kg serie 2") porque tres campos llamados "Peso" son inservibles con lector de pantalla, y el texto visible es subconjunto del nombre accesible (WCAG 2.5.3). 14 tests de la tarjeta + 6 de `parseDecimalInput`, RED observado.
- [ ] **T3.6b** Swipe-delete (Motion) y reorder con dnd-kit. Separada de T3.6a por ser otra preocupación —gestos y orden, con una dependencia nueva y su propio modelo de estado— y porque juntas no eran un work-unit revisable.
- [x] **T3.7a** `durationMinutes` (**M3**) + `useRestTimer` por `endTimestamp`. **Cerrada** (`0d2a213`), partida de T3.7 (ver `L14`). **El timer se deriva de un timestamp de fin, nunca de ticks acumulados**: es el gotcha de §8 del plan (iOS congela `setInterval` en background), y un contador que se decrementa solo volvería congelado — un descanso de dos minutos seguiría mostrando dos minutos después de diez. El intervalo **solo fuerza un re-render**; el número sale siempre del reloj. La otra mitad es la vuelta: `visibilitychange` y `focus` releen el reloj, así que el número está bien en el instante en que el usuario mira la pantalla. El test lo simula de verdad: mueve el reloj 90 s **sin dejar correr ningún tick**. El intervalo se apaga solo al terminar el descanso, en vez de palpitar cada 250 ms el resto de la sesión. **`durationMinutes` cierra M3**: nada calculaba la duración desde el `startedAt` del store, así que `duration_minutes` nunca se llenaba; **redondea** (52 min 40 s es un entrenamiento de 53 min para quien lo hizo) y devuelve `null` si el reloj fue para atrás, porque `null` es "no sé cuánto duró" y 0 es "entrené cero minutos". 8 tests del timer + 5 de la duración, RED observado.
- [x] **T3.7b** Screen Wake Lock durante el entrenamiento, con degradación si la API no existe. **Cerrada** (`3596be2`). Best-effort **por diseño**: la API falta en iOS anteriores a 16.4 y, donde existe ahí, solo funciona en PWAs instaladas; y aun existiendo, un pedido puede ser rechazado. En todos esos casos la pantalla puede apagarse a mitad de serie, el entrenamiento sigue funcionando, y **no hay nada que el usuario pueda hacer** — así que la falla se traga en vez de mostrarse, porque un error que nadie puede accionar es ruido en medio de una serie. **El browser suelta el lock solo**, cada vez que la página se oculta, y no avisa salvo por el evento `release` del propio sentinel; volver a la pantalla es la única señal de que hay que volver a tomarlo. Adquirir está guardado **dos veces** (sostenido o en vuelo), porque dos eventos de visibilidad que lleguen antes de que resuelva el primer pedido dejarían a la app sosteniendo locks que nunca suelta. 8 tests, con un doble que puede emitir el `release` iniciado por el browser. RED observado.
- [ ] **T3.8** Ejercicio custom local → sync en `save_workout`.
- [ ] **T3.9** Finalizar → `save_workout` + animación de PRs + badge "pendiente de sync".
- [ ] **T3.10** E2E Playwright: login → workout → 3 series → guardar → historial.

#### Fase 4 — Historial + Progreso

- [ ] **T4.1** Lista `useInfiniteQuery` con paginación keyset.
- [ ] **T4.2** Detalle workout y detalle ejercicio.
- [ ] **T4.3** uPlot lazy (peso máx / volumen / 1RM) sobre `exercise_progress`.
- [ ] **T4.4** Toggle kg/lb solo UI + helper de soft-delete (**M2**).
- [ ] **T4.5** Borrar workout / historial (**M2**).

#### Fase 5 — Dashboard

- [ ] **T5.1** `dashboard_summary()` en una llamada: saludo, dots semanales, racha, PRs, último workout, FAB.
- [ ] **T5.2** Skeletons + prefetch de historial y catálogo.

#### Fase 6 — Perfil + Extras

- [ ] **T6.1** Nombre, avatar (bucket `avatars`), unidad preferida.
- [ ] **T6.2** Stats derivadas (no columnas) + peso corporal.
- [ ] **T6.3** "Repetir workout" + export CSV + logout.

#### Fase 7 — PWA Polish + Deploy

- [ ] **T7.1** Manifest + iconos maskable + favicon + splash iOS.
- [ ] **T7.2** SW: precache shell, `StaleWhileRevalidate` catálogo, **nunca** cachear auth ni escrituras.
- [ ] **T7.3** Prompt de instalación Android + instrucciones iOS + meta/OG.
- [ ] **T7.4** Lighthouse 90+ ×4, bundle dentro del presupuesto medido en T0.8. **Sumar acá** la medición de controles de formulario en el audit de UI (alto y contraste de botones e inputs), que hoy solo mide texto y nav.
- [ ] **T7.5** Deploy Vercel + test e2e en dispositivo real (offline → online) + README.

---



---

## Log

### L1 · Pedido original del usuario

**No recuperable verbatim desde esta sesión, y no se inventa.** El pedido que originó el proyecto es anterior a este hilo; `mem_search` sobre "GymTracker" no devuelve observaciones previas y `mem_context` solo lista los prompts de esta sesión. Queda el hueco declarado, que es lo correcto: fabricar el texto sería fabricar evidencia de ciclo de vida.

**Fuente de requisitos efectiva, declarada por el usuario:** `PLAN.md` (revisado 2026-10-10), junto con `supabase/migrations/0001_init.sql`, `0002_rpcs.sql` y `supabase/seed.sql`. La cabecera histórica de este documento ya la declaraba como su fuente: `PLAN.md` se presenta como "Plan Único de Desarrollo" y sus DoD de §6 son las frases que citan los `S#`. Los `S#` se derivan de ahí; nada más se agregó.

---

**Cabecera histórica del documento.** Se conserva verbatim lo que este archivo declaraba como cabecera antes de la reestructuración del 2026-10-13 (ver `L6`). Describe el estado al cerrar la Fase 2 y contiene mediciones que no se repiten en ningún otro lado —el `41/41` de pgTAP, los 111.03 kB de ese momento, la verificación del `.env` contra la API real— así que se preserva en vez de resumirse: es evidencia.

**Estado:** Fase 0 cerrada. **Fase 1 completa**: schema, RLS, GRANTs, catálogo, integridad, soft delete y la RPC `save_workout` aplicados y verificados con pgTAP contra la base real (**41/41**, dos archivos). El harness de tests contra hosted quedó funcionando; ver "Hallazgos del harness". **Fase 2 completa**: T2.1, T2.2 y T2.3 cerradas. El cliente de Supabase se crea perezoso y queda fuera del bundle inicial (**111.03 kB** de 180), la app está detrás de un gate de sesión y las cuatro pantallas de auth son rutas diferidas. El flujo quedó verificado **en navegador real a 360px** contra el servidor: credenciales incorrectas en español, login, ruta protegida, recarga y logout sin dejar token. **Única milla sin cerrar**: el registro contra el servidor real necesita un email entregable (el proyecto exige confirmarlo; ver T2.3). El `.env` ya está con el nombre correcto y **verificado contra la API real**: `anon` recibe `42501 permission denied for table muscle_groups`, o sea que la URL y la publishable key son válidas y `anon` sigue afuera de las tablas. **Fase 3 en curso (2026-10-13)**: la base de la durabilidad offline quedó cerrada — el dispatcher de reanudación (T3.2b, `1ef4b8a`) y el cierre de la ventana de pérdida (T3.2c, `f4c7abd`), las dos tareas que el plan original no tenía. El bundle inicial pasó a **113.84 kB** de 180 con **cero** código de Zod, SDK de Supabase, uPlot, fuse o dnd-kit en el chunk inicial, verificado sobre el build, y el draft del entrenamiento ya vive en un store persistido (T3.1b, `19573de`).
**Repo:** `C:\Users\ulise\OneDrive\Documentos\Pogramming\JS\React\GymTracker`, rama `feat/gymtracker-mvp` (repo propio, fuera del repo accidental del home). `node_modules` es un **junction** a `C:\Users\ulise\develop\gymtracker-modules\node_modules` para no sincronizar 511 MB / 30.918 archivos.
**Fuente:** `PLAN.md` (revisado 2026-10-10) + `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rpcs.sql`, `supabase/seed.sql`.
**Revisión:** 2026-10-10. Hallazgos citados con `path:line`.
**No-objetivos (MVP):** social, rutinas con IA, push como dependencia, pagos, i18n.

### L2 · Gate de decisiones (2026-10-10)

| ID | Decisión | Resuelto como |
|----|----------|---------------|
| D1 | Ubicación y repo | `git init` propio, rama `feat/gymtracker-mvp`. **Revisada el 2026-10-11**: el proyecto volvió a OneDrive por convención del usuario, pero `node_modules` queda fuera con un junction a un store local |
| D2 | Fase 1 local (Docker) o hosted | Proyecto **hosted** de dev en Supabase (región São Paulo); Docker queda como opción futura |
| D3 | Parchear baseline o resolver por fase | Baseline parcheado antes de codear (`PLAN.md` + los 3 SQL + deps) |
| D4 | Primer incremento | **Fase 0 + Fase 1** (base verificable con review acotado) |

**Resuelto**: el proyecto hosted existe (`wcurruszasxgxzimlbdk`), está linkeado, y el CLI opera **sin contraseña** con su rol temporal (`cli_login_postgres`, ver H1).

---


### L3 · Hallazgos de la revisión (2026-10-10)

#### Bloqueantes (rompen algo real)

- **B1 · `recent_prs` con `LIMIT` inerte.** `supabase/migrations/0002_rpcs.sql:186-198` (duplicado en `PLAN.md:606`). Un `SELECT jsonb_agg(...)` sin `GROUP BY` devuelve **una** fila, así que `LIMIT 5` nunca recorta nada: el dashboard recibe **todos** los PRs, no 5. Fix: subconsulta interna `ORDER BY pr.achieved_at DESC LIMIT 5` y recién después agregar.
- **B2 · La cola offline no era durable como estaba documentada.** `PLAN.md:37,131` afirmaba que `persistQueryClient` conserva la cola de mutaciones y que solo faltaba `shouldDehydrateMutation`. **Diagnóstico corregido leyendo la fuente de `@tanstack/query-core`**: el default de ese predicado **no es `false`**, es `mutation.state.isPaused`, así que el agujero real es más fino — (a) una mutación solo llega a pausada mientras hay un retry pendiente, por lo que `retry: 0` la deja en error y no se persiste; (b) `resumePausedMutations()` filtra por `isPaused`, así que persistir otro estado deja una entrada muerta; (c) `dehydrateMutation` guarda solo `mutationKey`, `state`, `scope` y `meta`, y como el `mutationFn` no se serializa, una mutación restaurada **no tiene función que ejecutar**, mientras `Mutation.continue()` sí llama a `execute()`. La cola necesita un **dispatcher global** para ser reanudable. Además el retryer duerme el `retryDelay` **antes** de pausar: hay una ventana de ~2-3 s en la que la escritura offline todavía no está en disco. Zustand `persist` con IndexedDB sigue necesitando `StateStorage` propio e hidratación asíncrona.
- **B3 · `uuidv7()` en cliente sin dependencia.** `PLAN.md:130`. `crypto.randomUUID()` genera v4. Falta `uuid@^9` (soporta v7) o un generador propio; sin esto el DDL "IDs generados en cliente" no se puede cumplir.
- **B4 · Topología git rota.** `git rev-parse --show-toplevel` → `C:/Users/ulise`: el proyecto vive dentro del repo accidental del home (rama `master`, **0 commits**, sin remoto) y dentro de OneDrive, sin `.gitignore` para `node_modules/` ni `.supabase/`. Bloquea la disciplina de commits por work-unit y expone `.git` al sync de OneDrive.

#### Altos (drift o rework costoso)

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

#### Medios

- **M1** `ON CONFLICT (id) DO UPDATE` no actualiza `date` (`0002_rpcs.sql:48`): no se puede re-fechar un workout existente. Documentarlo.
- **M2** Ninguna fase cubre borrar un workout ni el historial; y la convención soft-delete ("todo query filtra `.is('deleted_at', null)`", §4.1) no tiene helper que la haga cumplir.
- **M3** `duration_minutes` no se calcula en ningún punto desde `startTime` del store.
- **M4** `body_measurements` no tiene `deleted_at`, rompe la convención global de soft delete.
- **M5** El seed deja `Glúteos` y `Cuerpo Completo` sin ejercicios ("Hip Thrust" quedó bajo Piernas) → el filtro por grupo muscular muestra grupos vacíos.
- **M6** Edición concurrente desde dos dispositivos = last-write-wins con reemplazo total de sets → pérdida silenciosa. Documentar como limitación MVP.
- **M7** Sin ADR para las decisiones de stack; el Apéndice de parches es trazabilidad de bugs, no de decisiones.

#### Hallazgos del harness de tests contra hosted (2026-10-12)

Ninguno era visible leyendo: aparecieron en la primera ejecución real de `supabase test db --linked`.

- **H1 · El rol de `pg_prove` no puede leer tablas.** El CLI crea un rol temporal (`cli_login_postgres`, contraseña que caduca a los 5 minutos) y pg_prove se conecta con él. Es miembro de `postgres` **con `INHERIT FALSE`** (`pg_has_role(...,'member') = true`), así que no hereda privilegios y toda lectura falla con `permission denied for table ...`. Fix: el test arranca con `set local role postgres`, la misma escalada que el CLI hace en sus propios queries.
- **H2 · pgTAP vive en `extensions` y el `search_path` no lo incluye.** El CLI ya instala la extensión ahí (dueño: `supabase_admin`) y el `search_path` de la conexión es `"$user", public`. Sin traer `extensions` explícitamente: `function plan(integer) does not exist`. El `GRANT USAGE` sobre `extensions` para el rol temporal resultó **innecesario** en cuanto el test escala a `postgres` (que sí tiene USAGE): se otorgó durante el diagnóstico, se revocó y el suite siguió en **21/21**. O sea que la base quedó sin privilegios fuera de las migraciones.
- **H3 · `plan(14)` contra 15 aserciones.** Defecto propio del archivo de tests, invisible mientras nunca se ejecutaba.
- **H4 · `db push --include-seed` NO ejecuta el seed.** El CLI solo registra el hash del archivo y lo deja marcado como aplicado ("Updating seed hash to supabase/seed.sql"); el catálogo siguió en 48 ejercicios después del push. Para aplicar catálogo al proyecto hosted hay que correrlo explícitamente: `supabase db query --linked -f supabase/seed.sql`. Por eso el seed es idempotente (migración 0005 + `ON CONFLICT DO NOTHING`).
- **H5 · `db query --linked` no es oráculo del catálogo.** Corre como `postgres`, pero su `pg_proc` **no ve las funciones de pgTAP** (0 filas para `plan`, mientras la sesión de pg_prove ve 1 `plan` y 8 sobrecargas de `fk_ok`). Sirve para datos, `pg_constraint`, `pg_indexes` e `information_schema`; no para concluir "esa función no existe".
- **H6 · `fk_ok` de pgTAP tiene 8 sobrecargas** y la llamada posicional `(schema, tabla, nombre_del_constraint, descripción)` cae en otra sobrecarga y falla. La aserción del FK compuesto se escribe con una consulta a `pg_constraint` que verifica la **forma** (columnas y columnas referenciadas): más fuerte que chequear el nombre, porque un FK simple contra `workouts(id)` volvería a dejar `user_id` libre, que es justo lo que A2 prohíbe.

---


### L4 · Pedido de estado (2026-10-13)

Verbatim: "Ok, como vamos en este proyecto y que nos falta para continuar con las funcionalidades y hacer que esto funcione."

Pedido **read-only** sobre un working tree limpio: no autoriza escritura. Produjo un informe de estado con una verificación real del árbol (typecheck limpio, `git status` vacío, 77/77 tests en 16 archivos) en vez de repetir lo documentado, y encontró el hueco de fondo: **la app no hacía nada todavía** — `DashboardPage`, `WorkoutPage` e `HistoryPage` eran `<PagePlaceholder>`. Todo el valor del producto estaba en la Fase 3 sin empezar. También identificó que las dos tareas que el plan no tenía (T3.2b, T3.2c) son prerequisito duro de T3.6–T3.9, no adorno.

### L5 · Autorización de la Fase 3 (2026-10-13)

Verbatim: "Si procede con fase 3" (enviado dos veces).

Alcance autorizado: ejecutar la Fase 3 completa. Decisión del usuario sobre T2.5: queda como deuda (opción 3 de las tres que se ofrecieron), porque no bloquea el core. Con eso, el camino crítico es T3.2b → T3.2c → T3.1b → T3.4 → … → T3.10, con la regla de que T3.2b y T3.2c van antes que cualquier UI, porque son la base sobre la que se apoya todo el registro de series.

### L6 · Regla de proceso: todo pasa por ODD (2026-10-13)

Verbatim: "Pasa siempre todo por odd".

Regla **permanente**, no por pedido puntual: todo el trabajo se rutea por Organic Driven Development, sin trabajo ad-hoc fuera del flujo. Guardada en Engram (`odd-process-rule`, scope `project`).

Este mismo pedido obligó a **corregir la forma de este documento**, que no cumplía lo que ODD manda: no tenía `## Specs` con `S#` ni `## Log` con `L1`, y las tareas no estaban alineadas a specs citadas, así que un subagente no podía recibir `Spec: odd/tasks/gymtracker-mvp.md, T3.6, S6` — esos `S#` no existían. La reestructuración movió los bloques existentes **verbatim** (gate de decisiones, hallazgos, registro de commits, desviaciones, presupuesto) a este `## Log`, sin borrar ni resumir evidencia, y agregó el índice de tareas con `S#`, ruta y commit.

**Excepción que ODD mismo fija y que esta regla no deroga**: una tarea **chica** —entendida, riesgo contenido, reanudable desde el pedido original y `git diff`— se queda inline y no crea artefactos durables. "Todo por ODD" significa no trabajar fuera del flujo, no crear un documento por cada arreglo trivial.

---

### L7 · Registro de commits (evidencia acumulada)

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
| T1.3 | `14ad965` `feat(db): guard workout_sets ownership with a composite foreign key` | FK compuesto verificado en vivo contra `pg_constraint` y por aserción que compara `conkey`/`confkey` (no el nombre) · suite 21/21 · typecheck, lint, 25/25 tests de app y build verdes |
| T1.5 | `176b5a6` `feat(db): fill the empty muscle groups and make the seed idempotent` | 57 ejercicios globales, 0 grupos vacíos, `Piernas` 8, un solo `Hip Thrust` · el seed se re-corrió contra la base y no duplicó nada |
| T1.8 | `d884544` `feat(db): put body_measurements under the soft-delete convention` | `has_column` + `has_index` sobre el índice parcial en la suite · limitaciones M1/M6/A4 documentadas en el README |
| T1.6 | `8260fb5` `test(db): run the schema suite against the hosted project` | **21/21** contra la base real · RED previo observado (14/15, fallando M5) y RED del conteo (48 vs 57) al cambiar el catálogo |
| Tipos generados + docs | `3d5fa74` `docs(db): regenerate database types and document the hosted harness` | diff real de 9 líneas (la columna nueva y el FK compuesto en la metadata de relaciones) · typecheck ✓ lint ✓ 25/25 ✓ build ✓ |
| T1.7 | `16432c4` `test(db): cover save_workout with an impersonation harness` | **41/41** con los dos archivos · verificado que la base queda sin usuarios ni workouts de prueba · el patrón de impersonación quedó documentado en el README |
| T2.1 | `c398990` `feat(auth): create the Supabase client lazily so the SDK stays out of the initial bundle` | A/B de presupuesto con consumidor temporal: inicial **107.98 → 108.16 kB gzip** (+176 B) y el SDK (**54.5 kB gzip**) en chunk aparte · 5 tests nuevos (peraza, singleton, URL/key/opciones, y los dos errores por variable faltante) · 30/30 tests, typecheck, lint y build verdes |
| T2.2 | `7f58d3d` `feat(auth): gate the app behind a session with AuthProvider and RequireAuth` | 12 tests nuevos y **42/42** con la suite entera · typecheck, lint sin warnings y build verdes · bundle inicial **108.91 kB** con el SDK todavía en chunk aparte · el lint marcó `react-refresh/only-export-components` y el context se extrajo a `auth-context.ts` |
| T2.3 + DoD | `<hash>` `feat(auth): add the four auth screens as deferred routes` | 35 tests nuevos y **77/77** con la suite entera · audit de UI: 36 mediciones, **0 hallazgos** · flujo real en navegador a 360px: **12/12** · contraste del botón **4.28 → 4.86:1** medido, antes y después |
| T3.2b | `1ef4b8a` `feat(offline): route the persisted queue through a real mutation dispatcher` | RED observado (módulo inexistente) · 6 tests nuevos y **83/83** · typecheck y lint limpios · build verificado: Zod en `schemas`/`auth`, no en el inicial. **Dos defectos propios encontrados acá**: (1) `QueryClient.unmount()` no es idempotente — llamarlo sin haber montado deja `#mountCount` negativo y todo `mount()` posterior sale temprano sin suscribirse a `onlineManager`, o sea que la cola dejaría de reanudarse en silencio; (2) había **dos tipos distintos** llamados `QueuedMutationVariables` (`queryClient.ts` genérico y `queued-mutations.ts` concreto), consolidados en uno |
| T3.2c | `f4c7abd` `fix(offline): close the two-second window where an offline write was still only in memory` | 7 tests nuevos y **90/90** · typecheck y lint limpios · bundle inicial **113.84 kB** de 180 (+2.81 kB sobre T2.3), medido a gzip nivel 9 sobre los chunks de `index.html` · **falso positivo descartado**: el inicial contiene la URL `wcurruszasxgxzimlbdk.supabase.co` (Vite inlinea `VITE_SUPABASE_URL` del `.env`) pero **0** ocurrencias de `GoTrueClient`, `PostgrestBuilder`, `SupabaseClient`, `ZodError`, `uPlot`, `fuseIndex`, `DndContext` y `useSortable` |
| T3.1b + T3.1c | `19573de` `feat(workout): hold the workout in progress in a persisted store` | RED observado en los dos tests de persistencia · 22 tests nuevos y **112/112** · typecheck y lint limpios · el store y Zustand todavía **no entran a ningún chunk**: ningún componente lo importa aún, así que el inicial sigue en 113.84 kB y el costo se va a pagar en el chunk de la ruta de workout (T3.6) |


### L8 · Desviaciones documentadas (no ocultas)

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
- **El `retryDelay` mira `onlineManager` en runtime (T3.2c).** Duplica el default exponencial de la librería porque `defaultRetryDelay` no está exportado. Es una **duplicación deliberada de una constante de tuning, no de una garantía**: si upstream cambia su default quedaríamos con un backoff distinto, no con un backoff roto. La alternativa —`retry: 0`— reintroduce el agujero que T3.2b documenta (sin retry no hay pausa, y sin pausa no hay persistencia).
- **La versión del caché se declara una sola vez (T3.2c).** `CACHE_VERSION` nombra tanto la clave de storage como el `buster` del persister. Antes la clave estaba versionada (`v1`) y el buster no (era `''`), así que un cambio de formato inflaba uno y dejaba el otro. Consecuencia del cambio: el buster pasó de `''` a `'v1'`, lo que invalida una vez todo caché persistido por un build anterior (solo desarrollo, no hay usuarios). El test que lo detectó fue el propio flush: escribía `buster: 'v1'` y el `persistQueryClientRestore` del test usaba el default `''` → `busted → removeClient()` y cero mutaciones restauradas. Se verificó en la fuente que `PersistQueryClientProvider` **sí** reenvía `persistOptions` (`...optionsRef.current.persistOptions`), así que la app era consistente y el defecto era solo del test; lo que quedó fue una mejora de fidelidad: **todos** los tests de persistencia ahora esparcen `persistOptions` en vez de reescribir `buster`/`dehydrateOptions` a mano, que era la forma de que pasaran mientras producción busteaba cada entrada.
- **El proyecto compila con `erasableSyntaxOnly`.** Prohíbe las parameter properties (`constructor(readonly kind: unknown)`), los enums y los namespaces. Aplica a todo el código nuevo de la fase.


### L9 · Presupuesto de bundle — seguimiento medido

El plan §7 fija 180 KB gzip para el bundle inicial, con la regla de **medir, no asumir** (A8). Serie medida hasta ahora:

| Momento | JS inicial (gzip) | Qué entró |
|---------|-------------------|-----------|
| Scaffold (T0.1–T0.4) | 68.85 kB | React + ReactDOM + Tailwind |
| PWA (T0.5) | 69.87 kB | registro del SW + `virtual:pwa-register` |
| Router y shell (T2.4) | 100.47 kB | React Router 8: ~30.5 kB gzip |
| Cola offline (T3.1–T3.3) | **109.37 kB** | TanStack Query + persisters + idb-keyval: ~8.9 kB gzip |
| Cliente de Supabase perezoso (T2.1) | **107.98 kB** sin consumidor · **108.16 kB** con consumidor | El entry crece 176 B (el wrapper). El SDK de Supabase son **54.5 kB gzip** y van a su propio chunk: siguen fuera del inicial aunque haya consumidor. Desde acá la medición es gzip nivel 9 sobre los chunks que referencia `index.html`; las filas de arriba salen del reporte del visualizer, así que las décimas entre métodos no son señal |
| Gate de sesión (T2.2) | **108.91 kB** | +925 B: `AuthProvider`, `useAuth`, `RequireAuth` y el fixture de tests. El SDK sigue en su chunk aparte (54.5 kB), así que la primera pintura no lo descarga |
| Pantallas de auth (T2.3) | **111.03 kB** | +1.76 kB en el inicial (tabla de rutas y andamiaje compartido de las pantallas). Zod + React Hook Form van a `auth-*.js` (**34.59 kB gzip**), que solo baja al abrir una ruta de auth |
| Dispatcher de la cola (T3.2b) + ventana de pérdida (T3.2c) | **113.84 kB** | +2.81 kB en el inicial: el módulo de ruteo, el `retryDelay` y el flush. El handler real y su schema quedan **fuera**: `workout-api-*.js` 0.45 kB y `schemas-*.js` 23.42 kB (Zod compartido con las pantallas de auth) |
| Store del workout (T3.1b) | **113.84 kB** | Sin cambio, y eso es lo correcto: ningún componente importa `useWorkoutStore` todavía, así que Zustand y el store no entran a ningún chunk. El costo real se mide al cerrar T3.6, cuando la ruta de workout los importe |

Con 109.37 kB consumidos y **~71 kB de margen**, Zod + React Hook Form + Supabase (~73 kB estimados) ya **no entran**. **DECISIÓN TOMADA (2026-10-11): el presupuesto se mantiene en 180 kB y se mitiga.** Obligatorio a partir de acá: (1) los tres formularios de auth son rutas diferidas, con Zod y RHF en el chunk de cada pantalla; (2) **el cliente de Supabase no entra al bundle inicial** — se accede por un `getSupabase()` asíncrono con singleton perezoso, porque la primera pintura no lo necesita; (3) Sentry ya está fuera por import dinámico; (4) se vuelve a medir con el visualizer al cerrar cada fase y, si no entra, se reporta la cifra exacta antes de decidir otra cosa.

**Medición de T2.1 (2026-10-12)**: el SDK de Supabase pesa **54.5 kB gzip**, bastante más que los ~36 kB que se suponían — pero el requisito (2) es lo que sostiene el presupuesto: con un consumidor real, el bundle inicial crece **176 B** y el SDK entero se va a un chunk aparte. Quedan ~70 kB de margen para el chunk diferido de los formularios.

---

### L10 · Verificación independiente de la durabilidad (2026-10-13)

Disparador: la regla de verificación para riesgo alto (item 1, durabilidad de datos). Verificador independiente read-only sobre el rango `c84f06b..f4c7abd` (los commits `1ef4b8a` y `f4c7abd`), en una copia scratch fuera del repo, sin red, sin base y sin escribir en el workspace. Reportó los 5 claims y encontró **un defecto alto que la propia suite no veía**.

**Claims verificados** leyendo la fuente de la librería, no confiando en los tests:

1. La mutación restaurada es ejecutable por el default del cliente: `queryClient.ts:81` → `defaultOptions.mutations.mutationFn`; la cadena es `hydration.js:116-121` → `mutationCache.defaultMutationOptions` → `mutation.js:140-142`, donde `execute()` usa `this.options.mutationFn`.
2. Zod y el SDK de Supabase **no** están en el bundle inicial: el entry solo importa estáticamente `useAuth`, y `workout-api`, `dist-*` (el SDK) y `schemas` (Zod) se alcanzan **únicamente** por import dinámico.
3. El sobre de `flushQueryCache` es idéntico al del persister, el `buster` coincide, y `PersistQueryClientProvider` sí esparce `...optionsRef.current.persistOptions` hacia el restore. Nit reportado: el comentario de `persist-flush.ts` decía "synchronously" sobre la transacción de IndexedDB, y en realidad abre en un microtask — no afecta el mecanismo (los microtasks no dependen de timers), pero la palabra quedó imprecisa.
4. `retryDelay`: el orden está confirmado en `retryer.js:96-111` (duerme **antes** de `canContinue()`), el espejo `retryBackoff` coincide con `defaultRetryDelay`, y con `retry: 0` el retryer nunca llega a pausar.
5. Sin regresión: 19 archivos / 112 tests, typecheck y lint en 0, corridos en la copia scratch.

#### D1 · Alto — la cola restaurada no se reanudaba si la conexión ya estaba arriba. **CORREGIDO en `0fe09be`**

`hydrate()` no reanuda nunca, y `QueryClient.mount()` reanuda **solo dentro** de sus suscripciones de foco y de red, y ningún manager emite al suscribirse: solo registran listeners. Una escritura restaurada por una carga de página hecha con la conexión sana quedaba pausada **indefinidamente**: durable en disco y sin guardar. La suite propia no lo veía porque el único camino que ejercitaba era la **transición** online, no la conexión que ya estaba arriba. Se corrigió con `resumeQueuedMutations()` y el `onSuccess` del provider, y el test fija las dos mitades: montar solo la deja pausada, el push la ejecuta. RED observado antes del fix (`TypeError: resumeQueuedMutations is not a function`).

#### D2 · Medio — agotados los 3 reintentos, la escritura se descarta en silencio. **PENDIENTE DE DECISIÓN**

Reproducido por el verificador: una entrada que agota `retry: 3` pasa a `error`, deja de estar `isPaused` y por lo tanto **sale del sobre persistido** en la siguiente escritura. La pérdida ocurre ~7 s después de reanudar con el backoff 1/2/4 s, así que no cae en la ventana del camino offline común; pero una falla transitoria que sobreviva 3 reintentos pierde la sesión sin que nadie se entere. Es una decisión de producto —¿la UI lo muestra? ¿hay reintento manual?— y su lugar natural es T3.9, junto con el badge de "pendiente de sincronizar".

#### Hallazgo propio · Alto — la policy de SELECT de `exercises` expone filas custom ajenas

Detectado al abrir T3.4, no por la verificación. Está registrado como **T1.9** con el detalle; acá queda el hecho: el plan solo pedía que el catálogo **global** fuera legible, y la policy `USING (true)` hace legible también lo custom de otros usuarios. `fetchCatalog` recorta el resultado en el cliente para que la pantalla sea honesta hoy, y su código dice explícitamente que **eso no es el fix**: el fix es del servidor.

---

### L11 · La policy de lectura de `exercises`, acotada y aplicada (2026-10-13)

Decisión del usuario sobre T1.9: corregirla **y aplicarla al proyecto hosted**. Ejecutado en `97a732f`.

`0007_exercises_select_scope.sql` dropea y recrea `read exercises` con el invariante real: `COALESCE(is_custom, false) = false` es catálogo compartido, `created_by = auth.uid()` es tu propio custom. El `COALESCE` no es decorativo —`is_custom = false` **no** matchea NULL, así que sin él una fila global insertada sin la columna explícita habría quedado invisible para todos, que es un arreglo peor que el bug.

**Aplicada**: `migration list --linked` mostró `0007` como la única pendiente antes de empujar, y `db push --linked` la aplicó.

**Verificación honesta**: Docker **no está corriendo** en esta máquina, y `supabase test db --linked` corre `pg_prove` dentro de un contenedor, así que `supabase/tests/0003_exercises_scope_test.sql` **quedó escrito pero no ejecutado**. Para no dejar la migración sin evidencia, las mismas seis condiciones se corrieron contra la base real con una sonda SQL cruda (`stats/probe-0007.sql`, gitignoreado) vía `db query --linked`, que sí funciona sin contenedor (hallazgo H5: su `pg_proc` no ve pgTAP, de ahí que la sonda use `raise exception` en vez de aserciones). Resultado:

| Medición | Valor medido | Esperado |
|---|---|---|
| B ve los custom de A | **0** | 0 |
| A ve su propio custom | **1** | 1 |
| Globales que ve B / que existen | **57 / 57** | iguales |
| Filas que B ve en total | **57** | = globales, nada más |
| `anon` puede leer `exercises` | **false** | false |
| `qual` aplicado | `((COALESCE(is_custom, false) = false) OR (created_by = ( SELECT auth.uid() AS uid)))` | el de la migración |

La sonda aborta con `raise exception` si cualquiera de las condiciones falla, así que **no hubo excepción = las seis pasaron**. Todo dentro de una transacción con rollback, y verificado **después** del rollback: **0 usuarios de sonda** quedaron en la base.

**Deuda declarada**: el archivo pgTAP existe y declara `plan(8)` con 8 aserciones, pero nadie lo ejecutó todavía. La primera vez que haya Docker hay que correr `npx supabase test db --linked` y confirmar 8/8 antes de confiar en él.

**Efecto en el código**: el recorte que `fetchCatalog` hace en el cliente pasó a ser redundante. Se deja: es barato y documenta la intención donde se lee.

---

### L12 · El selector de ejercicios (2026-10-13)

T3.5 cerrada (`4d1a8bd`). Tres decisiones del componente valen la pena, porque ninguna es la obvia:

1. **La búsqueda foldea acentos, y foldea los dos lados.** `fuse.js` matchea caracteres: no sabe que "extension" y "Extensión" son la misma palabra, y nadie escribe la tilde en el teclado del teléfono a mitad de una serie. `normalizeForSearch()` (NFD + strip del bloque de marcas combinantes U+0300–U+036F) se aplica a los nombres indexados **y** a la consulta. Tiene test de idempotencia, porque normalizar algo ya normalizado tiene que ser seguro.
2. **El índice de fuse se construye sobre la lista ya filtrada por grupo.** Es lo que hace que el filtro y el texto no puedan contradecirse: "press" dentro de Tríceps tiene que volver **vacío**, no traer Press Banca de vuelta por la ventana de la búsqueda. Sin esto el filtro sería decorativo, y el test lo fija.
3. **Los arrays del catálogo van en `useMemo` con dependencias estables.** No es cosmético: con el `?? []` suelto, la caída por defecto es un array nuevo en cada render y **el índice de fuse se reconstruye en cada tecla**. Lo marcó el lint (`react-hooks/exhaustive-deps`) y el arreglo correcto fue el memo, no apagar la regla.

**Accesibilidad**: el filtro activo se marca con `aria-pressed`, no solo con color — la misma lección que dejó el defecto del tab activo en T2.4. Chips y filas usan `min-h-12`, el estándar de target que ya usa `Button`. **T7.4 tiene que medir estos controles**, porque el audit de hoy solo mira texto y nav.

15 tests nuevos (11 del modal, 4 de `normalizeForSearch`), RED observado antes de implementar. **Deuda de tooling**: `user-event` no está instalado y no se agregó a mitad de fase; los tests usan `fireEvent`.

---

### L13 · T3.6 partida en dos, y la tarjeta de series (2026-10-13)

**Desviación de alcance, declarada**: T3.6 se partió en **T3.6a** (la tarjeta con los inputs y los defaults, `716e3e7`) y **T3.6b** (swipe-delete + reorder con dnd-kit). Son dos preocupaciones distintas —entrada de datos contra gestos y orden— y juntas no eran un work-unit revisable: dnd-kit es una dependencia nueva con su propio modelo de estado y sus propias trampas táctiles. Es la misma razón por la que T3.2 ya se había partido.

**La tarjeta no tiene estado propio.** Todo lo que muestra sale del draft que el store persiste, y cada toque vuelve como callback. Eso es exactamente lo que hace que un entrenamiento a medio hacer sobreviva a un reload: acá no hay estado que perder.

**Los dos defaults son la misma pregunta contestada dos veces** (`seedForNextSet`). De la segunda serie en adelante, la serie de arriba: repetir el peso es el caso común y ahorra dos toques por serie. La primera serie de la tarjeta no tiene serie arriba, así que arranca donde quedó el ejercicio la última sesión, que es el peso que el usuario está por levantar otra vez. **El warmup no se hereda**, a propósito: los calentamientos van primero, así que una serie nueva es de trabajo salvo que el usuario diga otra cosa.

**Los campos son de texto con teclado decimal, no `type="number"`.** Un input numérico **rechaza la coma** con la que acá se escriben los pesos ("72,5") y encima reporta un valor **vacío** en lugar de un error, así que el usuario ve desaparecer lo que escribe. Son **no controlados** por la misma familia de razones: un campo controlado reescribiría "72," a "72" a mitad de la pulsación y el dígito siguiente caería después del 72, o sea "725". Y **un campo vacío se guarda como `null`, nunca como 0**, porque `Number('')` es 0 y una serie que el usuario salteó no es una serie de 0 kg.

**A11y**: el nombre accesible de cada input incluye el número de serie ("Peso en kg serie 2"), porque tres campos llamados "Peso" en pantalla son inservibles con lector de pantalla; el texto visible es un subconjunto del nombre accesible, que es lo que pide WCAG 2.5.3 (Label in Name). Los glifos de borrar son SVG en línea, no caracteres, siguiendo la decisión que ya había tomado T2.4.

14 tests de la tarjeta + 6 de `parseDecimalInput`, RED observado, **163/163 en 23 archivos**.

---

### L14 · T3.7 partida, y el timer por timestamp (2026-10-13)

**Desviación de alcance, declarada**: T3.7 también se partió — **T3.7a** (`0d2a213`, la aritmética de duración y el hook del timer) y **T3.7b** (Screen Wake Lock). Wake Lock es una API de dispositivo con permisos y degradación propia, no aritmética de tiempo: no comparten ni el modelo mental ni los tests. Es la misma regla que ya se aplicó a T3.2 y a T3.6.

**El timer se deriva de un timestamp de fin, nunca de ticks acumulados.** Es el gotcha que el plan ya había anotado en §8: iOS congela `setInterval` en una pestaña en background, así que un contador que se decrementa solo volvería congelado y un descanso de dos minutos seguiría mostrando dos minutos después de diez. El intervalo de acá **solo fuerza un re-render**; el número sale siempre del reloj. La otra mitad es la vuelta: `visibilitychange` y `focus` releen el reloj, así que el número está bien en el instante en que el usuario mira la pantalla y no en el tick que venga después. Hay un test que simula exactamente eso: mueve el reloj 90 s **sin dejar correr ningún tick** y verifica que al volver el restante es el correcto.

**El intervalo se apaga solo cuando el descanso termina**, en vez de quedar palpitando cada 250 ms por el resto de la sesión — que en una app que además va a pedir Wake Lock es batería.

**`durationMinutes` cierra M3.** Nada calculaba la duración desde el `startedAt` del store, así que `duration_minutes` nunca se llenaba. **Redondea** en vez de truncar, porque 52 minutos y 40 segundos son un entrenamiento de 53 minutos para quien lo hizo, y devuelve **`null`** si el reloj fue para atrás: una duración negativa no es una duración, e inventar una escribiría un número incorrecto en el entrenamiento que se está guardando. Que sea `null` y no 0 importa: 0 es "entrené cero minutos", `null` es "no sé cuánto duró".

13 tests nuevos (8 del timer, 5 de la duración), RED observado, **176/176 en 24 archivos**.

---

### L15 · T3.7b, el Wake Lock best-effort a propósito (2026-10-13)

Cerrada en `3596be2`. Toda la implementación es **best-effort por diseño**: la API falta en iOS anteriores a 16.4 y, donde existe ahí, solo funciona en PWAs instaladas; y aun existiendo, un pedido puede ser rechazado. En todos esos casos la pantalla puede apagarse a mitad de serie, el entrenamiento sigue funcionando, y **no hay nada que el usuario pueda hacer** — así que la falla se traga en vez de mostrarse. Un error que nadie puede accionar es ruido en la pantalla en medio de una serie, no información.

**La mitad difícil es que el browser suelta el lock solo.** Lo hace cada vez que la página se oculta, y no avisa a nadie salvo por el evento `release` del propio sentinel. Volver a la pantalla es la única señal de que hay que volver a tomarlo, así que `visibilitychange` con `visible` lo re-adquiere. Adquirir está **guardado dos veces** (sostenido, o en vuelo) porque dos eventos de visibilidad que lleguen antes de que resuelva el primer pedido dejarían a la app sosteniendo locks que nunca suelta — peor que no tener ninguno.

**Dos detalles propios.** El typecheck marcó que el narrowing de `api` **no sobrevive dentro de `acquire`** (es un cuerpo de función aparte que corre después), así que va un alias no opcional con el motivo escrito al lado en vez de un `!`. Y el doble de test tuvo que poder **emitir el `release` iniciado por el browser**: sin eso no se puede simular la única forma en que la API avisa que soltó el lock, y el test de re-adquisición no probaría nada.

8 tests nuevos, RED observado, **184/184 en 25 archivos**.

---

### L16 · La suite pgTAP completa, en verde (2026-10-13)

Con Docker disponible se corrió `npx supabase test db --linked` por primera vez desde que existe el archivo nuevo:

```
0001_schema_test.sql ........... ok
0002_save_workout_test.sql ..... ok
0003_exercises_scope_test.sql .. ok
All tests successful.
Files=3, Tests=49, 5 wallclock secs
Result: PASS
```

**49 aserciones en 3 archivos.** La aritmética es en sí misma la confirmación independiente de que el `plan(8)` de `0003` estaba bien contado: 21 + 20 + 8 = 49. Si el plan hubiera declarado otro número, pgTAP habría fallado el archivo.

**La deuda de `L11` queda cerrada**: el archivo que se había escrito sin poder ejecutar corre y pasa. Y la policy de `exercises` queda verificada por **dos caminos distintos** —la sonda SQL cruda contra la base real, y ahora las aserciones pgTAP dentro de una transacción con rollback—, que es exactamente la redundancia que se quiere para un cambio de seguridad. `L11` no se reescribe: era cierto cuando se escribió.

**Corrección de registro**: el estado de una sesión anterior decía que la suite tenía 41 aserciones (21 + 20). Con `0003` son **49**.

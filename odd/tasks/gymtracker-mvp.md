# GymTracker MVP — Tareas ODD

**Estado:** Fase 0 cerrada salvo `.env.example` (bloqueado por la política de seguridad del harness). Fase 1 lista para arrancar en cuanto exista el proyecto hosted de Supabase.
**Repo:** `C:\Users\ulise\develop\GymTracker`, rama `feat/gymtracker-mvp` (repo propio, fuera de OneDrive y del repo accidental del home).
**Fuente:** `PLAN.md` (revisado 2026-10-10) + `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rpcs.sql`, `supabase/seed.sql`.
**Revisión:** 2026-10-10. Hallazgos citados con `path:line`.
**No-objetivos (MVP):** social, rutinas con IA, push como dependencia, pagos, i18n.

---

## 0. Gate de decisiones — cerrado

| ID | Decisión | Resuelto como |
|----|----------|---------------|
| D1 | Ubicación y repo | Movido a `develop/GymTracker` + `git init` propio, rama `feat/gymtracker-mvp` |
| D2 | Fase 1 local (Docker) o hosted | Proyecto **hosted** de dev en Supabase (región São Paulo); Docker queda como opción futura |
| D3 | Parchear baseline o resolver por fase | Baseline parcheado antes de codear (`PLAN.md` + los 3 SQL + deps) |
| D4 | Primer incremento | **Fase 0 + Fase 1** (base verificable con review acotado) |

**Pendiente operativo de D2:** el proyecto hosted necesita que el usuario cree el proyecto en Supabase y autorice el `supabase login` (token) o entregue el `service_role`/connection string para `db push` y `gen types`.

---

## 1. Hallazgos de la revisión

### Bloqueantes (rompen algo real)

- **B1 · `recent_prs` con `LIMIT` inerte.** `supabase/migrations/0002_rpcs.sql:186-198` (duplicado en `PLAN.md:606`). Un `SELECT jsonb_agg(...)` sin `GROUP BY` devuelve **una** fila, así que `LIMIT 5` nunca recorta nada: el dashboard recibe **todos** los PRs, no 5. Fix: subconsulta interna `ORDER BY pr.achieved_at DESC LIMIT 5` y recién después agregar.
- **B2 · La cola offline NO persiste mutaciones.** `PLAN.md:37,131,963` afirman que `persistQueryClient` conserva la cola de mutaciones. En TanStack Query v5 `shouldDehydrateMutation` por defecto es `false`: se persisten queries, **no** mutaciones. Tal como está documentado, un workout guardado sin señal se pierde al recargar. Requiere `dehydrateOptions.shouldDehydrateMutation` explícito **y** `networkMode: 'offlineFirst'` en `defaultOptions.mutations` (no solo en queries). Además Zustand `persist` con IndexedDB necesita un `StateStorage` custom (el default es localStorage) y su hidratación es asíncrona → `skipHydration` + await antes del primer render.
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

### Medios

- **M1** `ON CONFLICT (id) DO UPDATE` no actualiza `date` (`0002_rpcs.sql:48`): no se puede re-fechar un workout existente. Documentarlo.
- **M2** Ninguna fase cubre borrar un workout ni el historial; y la convención soft-delete ("todo query filtra `.is('deleted_at', null)`", §4.1) no tiene helper que la haga cumplir.
- **M3** `duration_minutes` no se calcula en ningún punto desde `startTime` del store.
- **M4** `body_measurements` no tiene `deleted_at`, rompe la convención global de soft delete.
- **M5** El seed deja `Glúteos` y `Cuerpo Completo` sin ejercicios ("Hip Thrust" quedó bajo Piernas) → el filtro por grupo muscular muestra grupos vacíos.
- **M6** Edición concurrente desde dos dispositivos = last-write-wins con reemplazo total de sets → pérdida silenciosa. Documentar como limitación MVP.
- **M7** Sin ADR para las decisiones de stack; el Apéndice de parches es trazabilidad de bugs, no de decisiones.

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

- [ ] **T1.1** (D3) B1 (`recent_prs`) y A3 (`REVOKE`) **aplicados en el baseline** en `0002_rpcs.sql`. Falta verificar la ejecución real contra la base.
- [ ] **T1.2** (D3) A1 **aplicado en el baseline**: `owner_id` vía `storage.foldername(name)[1]`, comentario y `public = true` coherentes, convención de path `<user_id>/<archivo>`. Falta verificación real.
- [ ] **T1.3** Guard de integridad A2 (`workout_sets.user_id` ≡ `workouts.user_id`).
- [ ] **T1.4** (D2) `supabase init` + `start` + `db reset` + `gen types` → `src/types/database.ts`.
- [ ] **T1.5** Seed: cubrir `Glúteos` y `Cuerpo Completo` (M5).
- [ ] **T1.6** Harness de test RLS real (A6) + casos: A no lee/crea/edita datos de B; A no toca ejercicios globales; A sí crea custom propios.
- [ ] **T1.7** Tests de `save_workout`: idempotencia por UUID, ownership `Forbidden`, Epley, warmups excluidos, PR no baja (A4).
- [ ] **T1.8** Documentar limitaciones M1/M6 y agregar `deleted_at` a `body_measurements` (M4).

### Fase 2 — Auth + Shell

- [ ] **T2.1** `src/lib/supabase.ts` con `persistSession`. **Bloqueado**: necesita `VITE_SUPABASE_URL` y la anon key del proyecto hosted (D2).
- [ ] **T2.2** `AuthContext` + `useAuth()` + `RequireAuth`. **Bloqueado** por T2.1.
- [ ] **T2.3** Login / Register / Forgot Password (RHF + Zod, errores en español). **Bloqueado** por T2.1.
- [x] **T2.4** Shell + BottomNav + skeletons, sin spinners — **cerrada salvo las transiciones con Motion**, que se posponen para no meter la librería en el bundle inicial. Entregado: `src/app/routes.tsx` (React Router 8 con cada ruta en su propio chunk lazy), `src/app/router.tsx`, `src/App.tsx`, `AppShell` (columna única, skip-link, padding que reserva la nav fija), `BottomNav` (4 destinos, `aria-current` vía `NavLink`, `end` en la raíz), `Skeleton`, `PagePlaceholder` y los 5 placeholders de ruta. **Iconos SVG en línea en vez de los emojis del plan**: los emojis renderizan distinto en cada plataforma y no heredan el color del texto, así que no pueden formar parte de un sistema de diseño. Verificado: 15 tests en 4 archivos + smoke test del build servido (`/`, `/history`, `/profile`, `/sw.js`, `/manifest.webmanifest` → 200, y `/history` devuelve el shell HTML, que es el fallback SPA que `vercel.json` debe reproducir).

### Fase 3 — Workout Core (offline-first) ⭐

- [ ] **T3.1** `useWorkoutStore` (Zustand + `StateStorage` IndexedDB + `skipHydration`) con guard anti doble finish (**B2**).
- [ ] **T3.2** QueryClient con `persistQueryClient` + `shouldDehydrateMutation` + `networkMode: 'offlineFirst'` en mutaciones (**B2**), verificado desconectando la red.
- [ ] **T3.3** Generación de IDs v7 en cliente con `uuid` (**B3**).
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

### Presupuesto de bundle — seguimiento medido

El plan §7 fija 180 KB gzip para el bundle inicial, con la regla de **medir, no asumir** (A8). Serie medida hasta ahora:

| Momento | JS inicial (gzip) | Qué entró |
|---------|-------------------|-----------|
| Scaffold (T0.1–T0.4) | 68.85 kB | React + ReactDOM + Tailwind |
| PWA (T0.5) | 69.87 kB | registro del SW + `virtual:pwa-register` |
| Router y shell (T2.4) | **100.37 kB** | **React Router 8: ~30.5 kB gzip** |

Con 100.37 kB ya consumidos y **~79 kB de margen**, la Fase 2 (Zod + React Hook Form) y la Fase 3 (TanStack Query + Supabase) aprietan el techo: estimaciones gruesas las ponen en ~73 kB combinados. **Decisión pendiente para el usuario**: mantener 180 kB y mitificar (cargar los formularios de auth de forma diferida, diferir el cliente de Supabase detrás del login) o revisar el presupuesto con los números medidos. No se decide solo.

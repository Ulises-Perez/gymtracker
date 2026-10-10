# GymTracker MVP — Tareas ODD

**Estado:** decisiones D1–D4 cerradas. Baseline parcheado y commiteado. Primer incremento autorizado: **Fase 0 + Fase 1**.
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

- [ ] **T0.1** (D1) Repo aislado + `.gitignore` + `.gitattributes` **hechos** (repo propio en `develop/GymTracker`, rama `feat/gymtracker-mvp`). Falta el scaffold Vite React-TS **en el root existente** y borrar la carpeta vacía que quedó en OneDrive.
- [ ] **T0.2** TS `strict` + `noUncheckedIndexedAccess`; ESLint 9 + Prettier + Husky + lint-staged.
- [ ] **T0.3** Tailwind v4 (`@tailwindcss/vite`) + tokens de diseño §5 en `index.css`.
- [ ] **T0.4** Dependencias completas, incluidas las faltantes de A7 (`uuid`, Radix, `@playwright/test`, `@testing-library/jest-dom`, `jsdom`).
- [ ] **T0.5** PWA `injectManifest` + `registerType: 'prompt'` + `src/sw.ts` (A7).
- [ ] **T0.6** Sentry por import dinámico, solo `import.meta.env.PROD` (A8).
- [ ] **T0.7** CI GitHub Actions `lint → typecheck → test → build` + `vercel.json` con rewrites (A7) + `.env.example`.
- [ ] **T0.8** Medición de bundle inicial con visualizer y registro del número real (A8).

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

- [ ] **T2.1** `src/lib/supabase.ts` con `persistSession`.
- [ ] **T2.2** `AuthContext` + `useAuth()` + `RequireAuth`.
- [ ] **T2.3** Login / Register / Forgot Password (RHF + Zod, errores en español).
- [ ] **T2.4** Shell + BottomNav (Home, Workout, History, Profile) + skeletons, sin spinners.

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
| Baseline (B1, A1, A3 + drift del plan y deps) | `chore(baseline): patch reviewed plan findings and isolate repo` | Estático: diff leído. **Pendiente**: ejecución real de las migraciones (requiere proyecto hosted o `supabase start`) |

# GymTracker

PWA mobile-first para registrar entrenamientos — funciona sin señal.

Estado: **Fase 7** (PWA instalable + deploy). La app está completa: registro,
entrenamiento offline-first con cola durable, historial, progreso por ejercicio,
perfil con foto y peso corporal, y service worker que cachea el shell y nada
más. El plan completo está en [`PLAN.md`](./PLAN.md) y el tablero de tareas en
[`odd/tasks/gymtracker-mvp.md`](./odd/tasks/gymtracker-mvp.md).

## Stack

Vite 8 · React 19 · TypeScript estricto · Tailwind v4 · TanStack Query · Zustand ·
Supabase · Vitest · Playwright.

## Requisitos

- Node 24+
- npm 11+

## Layout: `node_modules` **hoy** viaja con el proyecto

> **Ojo, esto cambió**: el proyecto estaba montado con `node_modules` como
> *junction* a una carpeta local para que OneDrive no sincronizara 440 MB. Ese
> junction **ya no está**: hoy `node_modules` es una carpeta común dentro del
> repo, con **30.803 archivos y 440 MB**, y OneDrive los sincroniza.
>
> Si eso molesta (y molesta: cada cambio de dependencia es una subida), el
> junction se vuelve a armar con el mismo truco de siempre — la carpeta destino
> tiene que llamarse literal `node_modules`, porque Node y TypeScript resuelven
> la ruta real y buscan subiendo por el árbol **solo carpetas con ese nombre**:

```powershell
mkdir C:\develop\gymtracker-modules          # o donde prefieras
mkdir C:\ruta\al\proyecto\node_modules        # carpeta vacía
rmdir C:\ruta\al\proyecto\node_modules        # se borra la vacía...
New-Item -ItemType Junction -Path C:\ruta\al\proyecto\node_modules `
                          -Target C:\develop\gymtracker-modules\node_modules
npm install
```

> **El detalle que rompe todo si se ignora**: un store que se llame distinto
> hace que un paquete no encuentre a sus hermanos, y el error que ves es
> desconcertante:
>
> ```
> Cannot find package 'react' imported from ...\store\@tanstack\react-query\build\modern\QueryClientProvider.js
> ```
>
> y el typecheck falla con «has no exported member» en decenas de imports que
> vienen por `export *`.

Sin junction, `npm install` funciona igual: simplemente OneDrive sincroniza
440 MB.

## Setup local

```bash
npm install
cp env.example .env   # completar con las credenciales de Supabase
npm run dev
```

Variables (contrato tipado en `src/vite-env.d.ts`):

| Variable                        | Obligatoria       | Qué es                                                              |
| ------------------------------- | ----------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | sí (desde Fase 1) | Project URL del proyecto hosted                                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sí (desde Fase 1) | Publishable key (la que antes se llamaba "anon"); viaja al cliente, RLS es la defensa |

## Base de datos

Las migraciones viven en `supabase/migrations/` y el catálogo (grupos musculares
+ ejercicios) en `supabase/seed.sql`. Contra el proyecto hosted:

```bash
npx supabase db push --linked --include-seed           # migraciones
npx supabase db query --linked -f supabase/seed.sql    # seed (ver punto 1)
npx supabase test db --linked                          # suite pgTAP (necesita Docker)
```

Cuatro cosas del harness que no son obvias y se descubrieron ejecutando:

1. **`db push --include-seed` no ejecuta el seed**: solo registra el hash del
   archivo. Para que un cambio de catálogo llegue al proyecto hosted hay que
   correrlo explícitamente con `db query -f`. El seed es **idempotente**
   (`ON CONFLICT DO NOTHING` contra `ux_exercises_global_name`, migración 0005),
   así que re-correrlo agrega lo nuevo sin duplicar filas ni resetear nada.
2. **El suite escala de rol.** `pg_prove` se conecta con `cli_login_postgres`, el
   rol temporal que crea el CLI (su contraseña caduca a los 5 minutos) y que no
   tiene privilegios sobre las tablas. El test arranca con `set local role
   postgres`: la misma escalada que hace el CLI en sus propios queries. Sin eso,
   toda lectura falla con `permission denied for table ...`.
3. **pgTAP vive en el schema `extensions`** (lo instala el CLI) y el
   `search_path` de la conexión es `"$user", public`, así que el test lo trae
   explícitamente.

`db query --linked` es además la vía para SQL suelto contra el proyecto
linkeado: corre como `postgres` y no necesita Docker.

4. **Los tests que necesitan `auth.uid()` impersonan dentro de un bloque `DO`**
   (`set local role authenticated` + `set_config('request.jwt.claims', ...)`) y
   dejan el resultado en GUCs de transacción para poder assertar ya de vuelta
   como `postgres`, que es el único rol que ve las tablas. Así los tests de RLS y
   de RPC no necesitan concederle nada a `authenticated` (ver
   `supabase/tests/0002_save_workout_test.sql`).

## Scripts

| Script                                    | Qué hace                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                             | Servidor de desarrollo en `:5173`                            |
| `npm run build`                           | Typecheck + build de producción                              |
| `npm run preview`                         | Sirve el build de producción (lo que se deploya)             |
| `npm run typecheck`                       | `tsc -b` sobre las referencias de proyecto                   |
| `npm run lint`                            | ESLint 10 (flat config)                                      |
| `npm run format`                          | Prettier sobre código, no sobre docs                         |
| `npm test`                                | Vitest en modo CI                                            |
| `npm run e2e`                             | Playwright (contra el stack local de Supabase)               |
| `node scripts/measure-bundle.mjs`         | El bundle inicial medido del build, en gzip, contra el tope |
| `node scripts/ui-audit.mjs`               | Audit objetivo de UI: contraste, tap targets, overflow      |
| `node scripts/generate-icons.mjs`         | Regenera iconos, splash y favicon desde los tokens          |

## Deploy

El destino es **Vercel** con el preset de Vite: build `npm run build`, salida
`dist/`. `engines.node` está fijado en `24.x` porque es la misma major con la que
construye CI; sin declararlo, Vercel elige la suya.

`vercel.json` ya tiene las dos cosas que no son obvias y que rompen en silencio:

- El **rewrite de todas las rutas a `/index.html`**. Sin él cada deep link de
  React Router (`/history`, `/workout`) da 404. Los archivos reales se sirven
  desde disco antes de aplicar el rewrite, así que `/sw.js` y `/assets/*` no se
  ven afectados.
- El **`Cache-Control` de revalidación sobre `/sw.js`**. Con un service worker
  cacheado de más, el aviso de "nueva versión" nunca aparece y los usuarios
  quedan clavados en un build viejo.

### 1 · Variables de entorno en Vercel

Ninguna vive en el repo: `.env` está ignorado por git y el contrato está en
`env.example`. Hay que cargarlas en el proyecto de Vercel para **Production y
Preview**:

| Variable                         | Obligatoria | Si falta                                                                     |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`              | Sí          | El **build pasa igual** y la app rompe en runtime al primer uso de Supabase   |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | Sí          | Ídem                                                                          |

**El detalle que muerde**: Vite inlinea estas variables en tiempo de *build*, así
que un deploy sin ellas compila sin chistar y publica una app rota. El error
recién aparece en el navegador, como `VITE_SUPABASE_URL is missing`. Si el deploy
dice "listo" pero la app no carga datos, es esto y no Supabase.

### 2 · Después del primer deploy: Supabase tiene que conocer el dominio

Mientras el único dominio autorizado sea `localhost:5173`, el login funciona en
desarrollo y **el registro no**: los links de confirmación y de recuperación
vuelven a una URL que Supabase no autoriza. En el dashboard del proyecto, en
**Authentication → URL Configuration**:

- **Site URL**: la URL de producción.
- **Redirect URLs**: agregar la de producción y, opcionalmente, el patrón de
  previews (`https://*-<scope>.vercel.app/**`). Sin el patrón, los previews
  quedan afuera del login.

Es un cambio del lado del servidor: no hace falta redeployar.

### 3 · Checklist antes de dar una URL por buena

- [ ] `npm run build` verde (es lo mismo que corre CI: lint → typecheck → test → build).
- [ ] Las variables cargadas en Vercel, para Production **y** Preview.
- [ ] `/`, `/workout`, `/history` y `/profile` cargan y hacen deep link sin 404.
- [ ] `/sw.js` responde con `Cache-Control: public, max-age=0, must-revalidate`.
- [ ] Login con un usuario real de la base (el **registro** depende del email, ver T2.5).
- [ ] El prompt de instalación aparece (los iconos y el manifest son de T7.1; el prompt, de T7.3).

## Convenciones

- Los pesos se guardan **siempre en kg** (`weight_kg`); la conversión a lb es
  solo de presentación y vive en `src/lib/utils.ts`.
- Las columnas `DECIMAL` de Postgres llegan como **string** desde `supabase-js`:
  todo valor numérico pasa por `toNumber()`.
- `backdrop-filter` está permitido únicamente en `.bottom-nav` y `.overlay`.

## Limitaciones conocidas del MVP

- **Un workout no se puede re-fechar.** `save_workout` hace `ON CONFLICT (id) DO
  UPDATE` pero no actualiza `date`: editar la fecha de un entrenamiento existente
  no tiene efecto (hallazgo M1).
- **Dos dispositivos a la vez pierden datos.** La edición concurrente es
  last-write-wins y `save_workout` reemplaza el set completo de series, sin
  merge (hallazgo M6). El MVP asume un dispositivo por vez.
- **Un PR no baja nunca.** Borrar o editar la serie que logró el récord deja el PR
  viejo como mejor marca; el MVP lo documenta en vez de recalcularlo
  (hallazgo A4).

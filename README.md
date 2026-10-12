# GymTracker

PWA mobile-first para registrar entrenamientos — funciona sin señal.

Estado: **Fase 0** (setup). Todavía no hay features de producto.
El plan completo está en [`PLAN.md`](./PLAN.md) y el tablero de tareas en
[`odd/tasks/gymtracker-mvp.md`](./odd/tasks/gymtracker-mvp.md).

## Stack

Vite 8 · React 19 · TypeScript estricto · Tailwind v4 · TanStack Query · Zustand ·
Supabase · Vitest · Playwright.

## Requisitos

- Node 24+
- npm 11+

## Layout: por qué `node_modules` no viaja con el proyecto

El proyecto vive en OneDrive, pero `node_modules` (**511 MB en 30.918 archivos**) queda **fuera del sync**: es un *junction* a una carpeta local.

```
C:\Users\ulise\OneDrive\Documentos\Pogramming\JS\React\GymTracker
└── node_modules  →  junction  →  C:\Users\ulise\develop\gymtracker-modules\node_modules
```

Si clonás el repo en otra máquina, creá el junction antes de instalar (PowerShell, sin permisos de administrador):

```powershell
mkdir C:\develop\gymtracker-modules          # o donde prefieras
mkdir C:\ruta\al\proyecto\node_modules        # carpeta vacía
rmdir C:\ruta\al\proyecto\node_modules        # se borra la vacía...
New-Item -ItemType Junction -Path C:\ruta\al\proyecto\node_modules `
                          -Target C:\develop\gymtracker-modules\node_modules
npm install
```

> **El detalle que rompe todo si se ignora**: la carpeta destino tiene que llamarse literalmente `node_modules`. Node y TypeScript resuelven la *ruta real* y buscan subiendo por el árbol de directorios **solo carpetas llamadas `node_modules`**; si el store se llama distinto, un paquete no encuentra a sus hermanos y el error que ves es desconcertante:
>
> ```
> Cannot find package 'react' imported from ...\store\@tanstack\react-query\build\modern\QueryClientProvider.js
> ```
>
> y el typecheck falla con «has no exported member» en decenas de imports que vienen por `export *`.

Sin junction, `npm install` funciona igual: simplemente OneDrive empieza a sincronizar 511 MB.

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
| `VITE_SENTRY_DSN`               | no                | vacía ⇒ el build no incluye nada de Sentry                          |

## Base de datos

Las migraciones viven en `supabase/migrations/` y el catálogo (grupos musculares
+ ejercicios) en `supabase/seed.sql`. Contra el proyecto hosted:

```bash
npx supabase db push --linked --include-seed           # migraciones
npx supabase db query --linked -f supabase/seed.sql    # seed (ver punto 1)
npx supabase test db --linked                          # suite pgTAP (necesita Docker)
```

Tres cosas del harness que no son obvias y se descubrieron ejecutando:

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

## Scripts

| Script              | Qué hace                                        |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo en `:5173`               |
| `npm run build`     | Typecheck + build de producción                 |
| `npm run typecheck` | `tsc -b` sobre las referencias de proyecto      |
| `npm run lint`      | ESLint 10 (flat config)                         |
| `npm run format`    | Prettier sobre código, no sobre docs            |
| `npm test`          | Vitest en modo CI                               |
| `npm run e2e`       | Playwright                                      |

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

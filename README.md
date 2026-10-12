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

## Scripts

| Script              | Qué hace                                        |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo en `:5173`               |
| `npm run build`     | Typecheck + build de producción                 |
| `npm run typecheck` | `tsc -b` sobre las referencias de proyecto      |
| `npm run lint`      | ESLint 9 (flat config)                          |
| `npm run format`    | Prettier sobre código, no sobre docs            |
| `npm test`          | Vitest en modo CI                               |
| `npm run e2e`       | Playwright                                      |

## Convenciones

- Los pesos se guardan **siempre en kg** (`weight_kg`); la conversión a lb es
  solo de presentación y vive en `src/lib/utils.ts`.
- Las columnas `DECIMAL` de Postgres llegan como **string** desde `supabase-js`:
  todo valor numérico pasa por `toNumber()`.
- `backdrop-filter` está permitido únicamente en `.bottom-nav` y `.overlay`.

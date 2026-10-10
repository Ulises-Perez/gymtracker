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

## Setup local

```bash
npm install
cp .env.example .env   # completar con las credenciales de Supabase
npm run dev
```

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

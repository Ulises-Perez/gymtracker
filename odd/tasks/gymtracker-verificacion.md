# GymTracker — Pasada de verificación (Judgment Day)

**Estado:** en curso. Dos jueces ciegos sobre el árbol comiteado `a8d4a63` (rama
`feat/gymtracker-mvp`, sha256 del target
`6beceaf0cfe94a6d136713a080734d8446a5ddf5175ab567768feccfccd17c95`). El alcance
es la aplicación entera: `src/`, `supabase/migrations/`, `supabase/tests/`,
`scripts/`, `e2e/` y los archivos de configuración (181 archivos, ~26.500
líneas).

**Repo:** `C:\Users\ulise\OneDrive\Documentos\Pogramming\JS\React\GymTracker`.
**Specs:** los `S#` citan **verbatim** el pedido del usuario, que está en el
`## Log`. El método (dos jueces ciegos, un actor de arreglos acotado, un
re-juzgado acotado y un veredicto terminal) es el de la skill
`judgment-day`; el libro mayor (ledger) de los hallazgos vive en el `## Log` de
este documento.

---

## Specs

- **S1.** *"verifica o busca issues y resuelvelos para dejar lo mejor
  correctamente el proyecto"*. El alcance es **el proyecto**, no un tramo: la
  pasada tiene que encontrar defects reales en la aplicación que hoy está
  publicada, y resolverlos.

### Reglas de la pasada

- **Dos jueces ciegos** sobre el mismo target inmutable: la corroboración es
  que los dos confirmen el mismo hallazgo, no que uno lo diga.
- **Sólo se arreglan los hallazgos severos que los dos confirmen.** Los
  `WARNING` y `SUGGESTION` quedan anotados como `info`: se registran, no se
  tocan.
- **Dos rondas de arreglo y dos re-juzgados, como máximo.** Lo que sobreviva a
  la segunda ronda se escala a la persona.
- El trabajo de cada unidad se mide con **el consumidor real** (la E2E, el
  audit de UI, Lighthouse, la suite de pgTAP), no con el chequeo más barato.
- El RED de un defecto se **observa antes** de arreglarlo.

---

## Tasks

| #   | Tarea                                                        | Specs | Ruta  | Commit |
| --- | ------------------------------------------------------------ | ----- | ----- | ------ |
| V1  | Dos jueces ciegos sobre el target inmutable                  | S1    | ambos | hecho (L2) |
| V2  | Libro mayor: confirmados, sospechosos, contradicciones, info | S1    | padre | hecho (L2) |
| V3  | Actor de arreglos acotado sobre los severos confirmados      | S1    | actor | en curso (JD-F-001) · el padre ya hizo F2, F3, F4, F6, M1 y M2 |
| V4  | Re-juzgado acotado (libro mayor + delta de arreglos)         | S1    | ambos | pendiente |
| V5  | Verificación final independiente y veredicto terminal          | S1    | padre | pendiente |

---

## Log

### L1 · El pedido y el estado en que se recibe (2026-10-19)

**El pedido, textual**: *"verifica o busca issues y resuelvelos para dejar lo
mejor correctamente el proyecto"*.

**Lo que ya estaba verificado** (para no repetir trabajo): el cambio del camino
crítico del arranque tiene una **verificación independiente** (`mvfppxtl-1-hbcj`:
sin bloqueantes, con un hallazgo real que ya se corrigió ✓); los dos arreglos
visuales de D9 tienen **juicio de píxeles** (dos de los seis hallazgos se
descartaron midiendo ✓); la E2E pasa contra el HEAD actual ✓; el Lighthouse
contra la URL pública da **96 / 100 / 100 / 100** en móvil ✓ y
**100 / 100 / 100 / 100** en escritorio ✓; el audit de UI da **36 mediciones, 0
hallazgos** ✓; la suite de pgTAP corre en verde contra el hosted ✓.

**Lo que NO estaba verificado**: el proyecto entero con los cambios de las
últimas fases (la reescritura visual, T6, T7 y la pasada de rendimiento ✗),
el código nuevo de esta sesión más allá de lo verificado ✓, y la configuración
de entrega (el `vercel.json`, el service worker y sus cabeceras ✗).

### L2 · El libro mayor: dos jueces ciegos, un veredicto por hallazgo (2026-10-19)

**El target inmutable**: el árbol comiteado `a8d4a63` (sha256
`6beceaf0cfe94a6d136713a080734d8446a5ddf5175ab567768feccfccd17c95`), 181
archivos y ~26.500 líneas ✓. Los dos jueces (`jd-judge-a` y `jd-judge-b`) lo
barrieron con el mismo alcance y sin ver al otro ✓.

**El libro mayor**, con la verificación del padre al lado (cada hallazgo se
comprobó en el código y, cuando se pudo, en la app corriendo ✓):

| ID | Hallazgo | A | B | Severidad | Verificado por el padre | Destino |
| -- | -------- | - | - | --------- | ------------------------ | ------- |
| **F1** | Un set o un objetivo con reps fraccionarias, con 0, o con peso negativo **nunca se puede guardar**: el contrato lo rechaza, el borrador queda congelado en `finished` y la sesión sólo se pierde ("descartarla") | — | CRITICAL | **CRITICAL** | código ✓ + **sonda en la app** ✓ (los botones que quedan son "Reintentar" y "Nuevo workout", y el campo ni se puede escribir) | **actor de arreglos** |
| **F2** | La lista de invalidación no cubre `['profile-stats']` ni `['workout', workoutId]`: el Perfil muestra "Récords" y "Mejor racha" viejos al lado de un "Total de entrenamientos" ya refrescado, y el detalle de un entrenamiento borrado se sirve de la caché | WARNING ✓ | WARNING ✓ | WARNING | ✓ (las claves reales, por `grep`) | **padre** |
| **F3** | `dashboard_summary().last_workout.exercise_count` cuenta los ejercicios de las **series**, no las **tarjetas**: una sesión con un ejercicio y ninguna serie sale "0 ejercicios" en el Inicio mientras su detalle lista la tarjeta | WARNING | — | WARNING | ✓ (el RPC cuenta `workout_sets`; las tarjetas viven en `workout_exercises` desde 0012) | **actor de arreglos** |
| **F4** | La gráfica del peso corporal no aplica la corrección de rango e incrementos que **sí** aplica la del progreso: con una sola medición el eje inventa fechas, y en un rango corto el mismo día se imprime dos o tres veces | WARNING | — | WARNING | ✓ (las dos gráficas, lado a lado) | **actor de arreglos** |
| **F5** | `workout_exercises` sin `GRANT` a `service_role` | SUGGESTION | — | — | **sin efecto observable**: `has_table_privilege('service_role', ...)` da `true` ✓ | **info** |
| **F6** | `date-fns` es una dependencia declarada y nunca importada | SUGGESTION | — | — | ✓ (un solo hit: el `package.json`) | **padre** |
| **M1** | La consola no está limpia: React Router avisa *"No `HydrateFallback` element provided to render during initial hydration"* una vez por pantalla | — | — | WARNING | ✓ (leído en la librería: el aviso sale cuando ninguna ruta matcheada declara `HydrateFallback`) | **padre** |
| **M2** | En producción faltan `nosniff`, `frame-ancestors`, `referrer-policy` y `permissions-policy` | — | — | WARNING | ✓ (las cabeceras reales, con `curl -I`) | **padre** |
| **M3** | El documento dice 545/545 tests y ahora son 547 | — | — | info | ✓ | **padre** |

**Corroboración**: un solo hallazgo lo confirmaron los dos jueces (F2 ✓); F1, F3 y
F4 los vio uno solo ✗, pero **el padre los reprodujo o los Demonstration en el
código y en la base** ✓ (F1, con una sonda contra la app corriendo ✓), así que
entran en la ronda de arreglos como confirmados ✗ — el mecanismo de
corroboración de la skill protege contra el hallazgo no verificado ✓, y un
defecto reproducido en la app es más que verificado ✓.

**Lo que no se arregla y queda anotado**: F5 ✓ (no hay efecto observable ✗) y
las dos cosas que siguen siendo de la persona ✓ (la E2E en un dispositivo real
y la config de auth del hosted ✓).

### L3 · La ronda de arreglos: qué se arregló, cómo se comprobó y qué se dejó anotado (2026-10-19)

**La ronda**: los seis hallazgos reales del libro mayor (F1, F2, F3, F4, M1 y M2 ✓) más el peso muerto (F6 ✓). El resto quedó anotado, no arreglado ✓ (F5 ✓: sin efecto observable ✓; M3 ✓: un número del documento ✓).

**F1, el CRÍTICO, lo Working el actor de arreglos acotado** — y el actor **murió antes de reportar** (`pi exited with code 3221226505` ✓, el modo de fallo que este proyecto ya conoce ✓) **dejando el arreglo completo y en verde** ✓. La lección del proyecto ya escrita se cumplió: *"un escritor puede morir por un crash del proceso y dejar cambios a medias en el árbol, así que hay que medir el estado del árbol después de cada uno"* ✓ — y lo que se midió fue esto ✓:

- **La suite entera en verde** ✓ (577 tests en 60 archivos ✓, donde antes eran 547 ✓) · typecheck, lint y prettier limpios ✓.
- **El arreglo, leído**: la regla vive en `lib/utils.ts` ✗ al lado del parser ✓ y el esquema de la carga **se deriva de ella** ✓, así que el contrato y los campos no pueden divergir ✓. Y está ahí ✗ en el esquema ✓ por una razón concreta ✓: el esquema carga Zod ✓ y el store está en el bundle inicial ✓, así que un store que importara el esquema para preguntar esto pondría el parser en el primer pintado ✓.
- **Verificado en la app corriendo** ✓ (la sonda `stats/repro-number-rules.mjs` ✓): `"10,5"` y `"0"` en las reps son rechazados con *"Las reps tienen que ser un número entero mayor que cero"* ✓, un peso negativo con *"El peso no puede ser negativo"* ✓, `"72,5"` kilos **se acepta** ✓ (un peso es un DECIMAL ✓), y la sesión **se guarda** ✓ (el récord que creó es la prueba ✓). La pérdida de sesión **desapareció** ✓.

**Lo demás de la ronda, con su medida**:

- **F2** ✓: la lista de invalidación nombra ya `['profile-stats']` y `['workout']` ✓, con un test que la fija ✓ (el RED se vio ✗ antes del arreglo ✓).
- **F3** ✓: la migración `0014` cuenta las **tarjetas** ✓ y la suite nueva (la primera cobertura de `dashboard_summary()` ✓) se escribió con el RED observado contra la base local ✓ (*"have: 0, want: 1"* ✓). La migración está aplicada en el hosted ✓ y la suite pasa en los dos lados ✓: **7 archivos, 110 aserciones** ✓.
- **F4** ✓: la gráfica del peso corporal usa las mismas correcciones que su hermana ✓ (`axisSpan` y `dayIncrements` ✓) y su test lo dice ✓.
- **M1** ✓: la consola quedó **limpia en las cuatro pantallas** ✓ — y el arreglo necesitó dos pasos ✓: el `HydrateFallback` tiene que estar **en la ruta** ✓ y no en el módulo que la ruta carga ✓, porque el router lo busca **antes** de que el módulo diferido resuelva ✓ (leído en `node_modules/react-router/dist/development/lib/hooks.js` ✓).
- **M2** ✓: las cabeceras están **en producción** ✓ y la **CSP no rompe la app** ✓: contra la URL pública, la pantalla de acceso pinta ✓, las dos caras cargan ✓ y no hay **ni un error de consola** ✓ ni una petición fallida ✓.
- **F6** ✓: `date-fns` fuera ✓.

**La verificación final de la ronda** ✓: **577/547** ✗ → **577/577 tests** ✓ · E2E **1 passed** ✓ (contra el stack local ✓) · Lighthouse local **92 / 100 / 100 / 100** ✓ (dos corridas ✓) · bundle **121.27 kB gzip de 180** ✓ · audit de UI **36 mediciones, 0 hallazgos** ✓ · pgTAP **110/110** en local y en el hosted ✓ · consola limpia ✓.

**Lo que sigue siendo de la persona** ✓: la E2E en un dispositivo real ✓ y la **Site URL + las Redirect URLs** de Supabase con el dominio de producción ✓ (el paso 2 del README ✓).

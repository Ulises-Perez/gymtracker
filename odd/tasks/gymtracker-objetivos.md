# Objetivo por ejercicio y secciones en el selector

**Estado:** En curso (2026-10-13). **O1** (`5372d35`) y **O2** (`ba28a6b`) cerradas. Alcance nuevo pedido por el usuario después del cierre de la Fase 3 del MVP (`odd/tasks/gymtracker-mvp.md`, `L28`).

Es una inserción y no una fase del plan: `PLAN.md` define Fases 4 a 7 (historial, dashboard, perfil, PWA) y esto no estaba en ninguna. Se documenta aparte para no diluir el MVP, que ya tiene 700 líneas.

---

## Specs

- **S1 · Secciones en el selector.** Pedido textual: "que sean por secciones como pecho, espalda, brazos". **Decisión del usuario**: "Agrupar el picker por grupo muscular" — la lista se organiza en secciones con encabezado (Pecho, Espalda, Bíceps…), cada una con sus ejercicios adentro. **Es sólo UI: no toca la base.** Los "grupos musculares" que ya existen son las secciones; no se inventa una capa nueva. Hoy son diez: Bíceps, Cardio, Core, Cuerpo Completo, Espalda, Glúteos, Hombros, Pecho, Piernas, Tríceps. Nota: "Brazos" no existe como grupo —hoy son Bíceps y Tríceps por separado— y **no se agrega** salvo que el usuario lo pida después.

- **S2 · Objetivo por ejercicio en la sesión.** Pedido textual: "dentro de cada seccion al elegir el ejercicio que se pueda agregar la cantidad de repeticiones y el peso minimo y max". **Decisión del usuario**: "Objetivo del ejercicio en esa sesión" — al agregar un ejercicio se puede definir **cantidad de repeticiones y un rango de peso (mín–máx)**, la tarjeta lo muestra como referencia mientras se cargan las series reales, y **se guarda con el entrenamiento**.

- **S3 · No-objetivos, explícitos.** Lo que NO cambia y por qué:
  - **El registro de series no cambia**: sigue siendo reps × un peso por serie. El rango es del objetivo, no de la serie.
  - **El cálculo de PRs no cambia**: `save_workout` sigue estimando el 1RM con Epley sobre el peso de cada serie.
  - **El objetivo no se valida ni se compara**: es una referencia, no una regla. No hay advertencias si el peso real cae fuera del rango, ni objetivos que se cumplan o incumplan. Eso sería una funcionalidad distinta y nadie la pidió.
  - **No hay rutinas ni plantillas**: el objetivo vive en la sesión, no se reutiliza entre entrenamientos. Repetir el objetivo de la vez pasada es una idea razonable y **queda para Fase 4**, donde existe la pantalla de historial para ofrecerlo.
  - **El historial no lo muestra**: esa pantalla es Fase 4 y sigue siendo un placeholder.

- **S4 · La forma del objetivo.** Tres valores **opcionales e independientes**: `targetReps: number | null`, `targetWeightMin: number | null`, `targetWeightMax: number | null`. Un objetivo a medias es válido — "10 reps" sin rango, o un rango sin reps —, porque el usuario escribe lo que sabe y los tres se llenan en momentos distintos. Se guardan como números, nunca como texto, y un campo vacío es `null`, nunca 0 (la misma regla que las series: un 0 diría que levantó cero kilos).

- **S5 · El presupuesto de bundle sigue siendo un tope duro.** "Presupuesto: 180 KB gzip". Al cierre de la Fase 3 estaba en **117.99 kB** (JS + CSS, medido con gzip level 9 sobre lo que referencia `index.html`). Nada de esto justifica pasarlo.

---

## Tasks

| ID | Qué | S# | Ruta | Commit |
| --- | --- | --- | --- | --- |
| O1 | El selector por secciones (UI, sin base) | S1 | cliente | `5372d35` |
| O2 | Servidor: tabla de objetivos + `save_workout` (migración + pgTAP + hosted) | S2, S4 | hosted | `ba28a6b` |
| O3 | Cliente: el draft (con migración de formato), el schema y el payload | S2, S4 | cliente | pendiente |
| O4 | La UI del objetivo: los campos al elegir y su lugar en la tarjeta | S2, S4 | cliente | pendiente |
| O5 | E2E del objetivo | S2 | e2e | pendiente |

### Detalle por tarea

- [x] **O1** El selector por secciones. **Cerrada** en `5372d35`, 3 tests nuevos. La lista plana pasó a ser secciones con encabezado por grupo muscular, en el orden en que el catálogo los devuelve, y cada ejercicio **adentro** de la suya; lo que no tiene grupo va último, en una sección propia, porque un ejercicio propio se puede crear sin grupo y dejarlo afuera lo escondería. Los chips se mantienen filtrando qué secciones se ven. La jerarquía se anuncia (la sección se nombra y nombra su lista). **Dos cosas aparecieron por correr los tests contra el selector viejo**: la versión plana renderizaba la lista **aunque estuviera vacía** (decisión de T3.5), y con secciones no hay lista cuando nada coincide —correcto, una sección vacía sería ruido— pero el helper esperaba una y dos tests ajenos a secciones se colgaron 5 s; y el fixture de grupos estaba en un orden que el servidor **nunca devuelve** (los ordena alfabéticamente), así que mis aserciones fijaban un layout inexistente. Ver `L4`.
- [x] **O2** Servidor: `workout_exercise_targets` y el paso de `save_workout` que la escribe, en la misma transacción que las series y los récords. **Cerrada** en `ba28a6b`. **`Files=5, Tests=73, Result: PASS` contra la base local y contra el proyecto hosted**, con RED observado antes (la tabla no existía, 13/13 fallidas). La clave lleva la **posición** porque el objetivo es de la tarjeta y el mismo ejercicio puede aparecer dos veces. Los tres valores son opcionales e independientes, y **`min < max` no se valida a propósito**: se tipean de a uno, y un CHECK convertiría un rango a medio escribir en un guardado que falla entero. De paso apareció un defecto de seguridad preexistente: el stack local era más permisivo que producción (ver `L5` y la migración `0010`).
- [ ] **O3** Cliente: el objetivo en el draft (con **migración de formato**, `version: 2`), en el schema Zod y en `toSaveWorkoutPayload`. El schema va en snake_case como el resto (`target_reps`, `target_weight_min`, `target_weight_max`) porque son los nombres que lee el RPC.
- [ ] **O4** La UI del objetivo: los tres campos aparecen **al elegir el ejercicio** —que es lo que el usuario pidió— y quedan también en la tarjeta para poder ajustarlos durante la sesión. El selector pierde por esto su "un toque y afuera" de T3.5: es un cambio deliberado y pedido, a cambio de poder fijar el objetivo al agregar.
- [ ] **O5** E2E: el flujo crítico suma el objetivo —fijarlo al agregar el ejercicio y verlo después de guardar— contra el stack local.

---

## Log

### L1 · Pedido del usuario (2026-10-13)

> Para registrar los ejercicios que sean por secciones como pecho, espalda, brazos y dentro de cada seccion al elegir el ejercicio que se pueda agregar la cantidad de repeticiones y el peso minimo y max. para probar el flujo real quiero que inicies la app para registrarme yo y probar tanto el register, login y demas dentro de la app

El pedido traía dos cosas de naturaleza distinta y se atendieron por separado: **levantar la app** (inmediato, sin ambigüedad) y **el cambio de producto** (alcance nuevo con una ambigüedad real que decidía si había migración o no).

### L2 · Decisiones del usuario (2026-10-13)

Preguntadas juntas, en una sola interacción, con las consecuencias de cada opción a la vista:

1. **Qué son las reps y el peso mín–máx** → **"Objetivo del ejercicio en esa sesión"**. Descartadas: "Referencia del catálogo (vale para siempre)" — habría metido las columnas en `exercises`, que es la tabla que comparten todos los usuarios, y el objetivo no es una propiedad del ejercicio sino de lo que el usuario se propuso esa vez; y "Un rango por serie, en vez de un peso" — habría cambiado `workout_sets` y el cálculo de PRs, que hoy usa un peso por serie, y nadie pidió registrar dos pesos.

2. **Cómo funcionan las secciones** → **"Agrupar el picker por grupo muscular"**. Es UI y no toca la base. Descartadas: "Una capa nueva de secciones más gruesas" — habría inventado un catálogo nuevo (y el usuario nombró "Brazos", que no existe: hoy son Bíceps y Tríceps) para resolver algo que los diez grupos actuales ya resuelven; y "Sólo agregar el grupo que falta" — que no era el pedido.

### L3 · La app levantada para probar, y contra qué backend (2026-10-13)

Mientras se decidía el alcance se levantó la app, que era la otra mitad del pedido: **`npm run dev` en `http://localhost:5173` apuntando al stack local de Supabase** (`127.0.0.1:54321`), para que el usuario pueda registrarse y probar login, logout y el entrenamiento.

**Contra local y no contra el proyecto hosted, y no es una preferencia**: el proyecto hosted tiene `mailer_autoconfirm: false` y el rate limit de envíos consumido — es la deuda abierta **T2.5** del MVP —, así que ahí el registro **no puede completarse** hasta que haya un email entregable. El stack local tiene `enable_confirmations = false` y el registro entra al instante, que es lo que el usuario quiere probar.

**Las credenciales se pasan por entorno y no en un archivo**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en la línea de comandos. Es el mismo mecanismo que la suite E2E (medido en `L26` del MVP: `process.env.VITE_*` **pisa** a `.env`), y evita escribir un `.env.e2e` —el guardarraíl de seguridad bloquea las rutas `.env*`— y evita también que un archivo con credenciales locales quede commiteado.

---

### L4 · O1 cerrada: el selector por secciones (2026-10-13)

Cerrada en `5372d35`. **274/274 unit tests en 34 archivos** (3 nuevos), typecheck y lint limpios.

**Lo que cambió**: la lista plana con chips arriba pasó a ser **secciones con encabezado por grupo muscular**, en el orden en que el catálogo los devuelve —alfabético, porque `fetchCatalog` ordena por nombre—, y cada ejercicio adentro de la suya. Lo que no tiene grupo va último, en una sección propia: un ejercicio propio se puede crear sin grupo, y **dejarlo afuera lo escondería de la única pantalla que puede ponerlo en un entrenamiento**. Los chips se mantienen filtrando qué secciones se ven: no eran el pedido, y borrar comportamiento que tiene tests propios para reemplazarlo por nada no es simplificar.

**La jerarquía se anuncia y no se implica**: cada sección se nombra a sí misma y también nombra la lista de adentro, así que quien use un lector de pantalla escucha a qué grupo pertenece cada ejercicio en vez de una sucesión plana de nombres.

**Dos cosas que aparecieron sólo por correr los tests contra el selector viejo antes de conservar el cambio** —que es exactamente lo que mi primer intento se saltó, y queda escrito porque el error fue mío:

1. **Rompí una decisión deliberada de T3.5.** La versión plana renderizaba la lista **aunque estuviera vacía**, para que "no hay resultados" fuera una lista vacía y no una lista ausente. Con secciones, cuando nada coincide no hay ninguna lista, y eso está bien —una sección sin ejercicios sería ruido—, pero **el helper que lee los nombres ofrecidos esperaba una lista**: dos tests que no tenían nada que ver con secciones (`survives a typo` y `combines the search with the group filter`) se colgaron 5 segundos. El helper ahora **espera al catálogo** en vez de esperar una lista, que es lo que "los resultados ya están" significa de verdad.
2. **El fixture mentía sobre los datos reales.** Listaba los grupos como `Pecho, Tríceps, Hombros`, y el servidor los devuelve **alfabéticos** (`.order('name')`). Mis aserciones nuevas estaban fijando un orden que producción nunca produce. Corregido el fixture, no la expectativa.

**Sin RED ninguna de las dos habría aparecido.** La primera corrida dio **4 fallas contra el selector viejo** (RED real, recuperado apartando la implementación con `git stash`); la segunda, ya con el cambio puesto, dio **5**, incluidas dos regresiones que mi propio cambio había causado. Ese contraste es la razón de correr el test contra el código viejo antes de creerle al verde.

---

### L5 · O2 cerrada: la tabla, el RPC, y un defecto de seguridad que no era mío (2026-10-13)

Cerrada en `ba28a6b`. **`Files=5, Tests=73, Result: PASS`** contra la **base local** y contra el **proyecto hosted** (60 previos + 13 nuevos; la aritmética vuelve a confirmar el `plan(13)`).

**Qué entró**: la tabla `workout_exercise_targets`, su policy y su `GRANT`, y el paso de `save_workout` que la escribe en la misma transacción que las series y los récords (S14). Trece aserciones, y las que valen no son el camino feliz: el mismo ejercicio en dos tarjetas conserva dos objetivos distintos, un payload que ya no los trae los borra, **B no ve ninguno de A**, y **B no puede escribir un objetivo sobre el workout de A**. Este último camino no lo cubre la policy —`save_workout` es `SECURITY DEFINER` y Postgres no aplica RLS al dueño de la tabla— lo cubre el check de ownership del principio de la función.

**El hallazgo que apareció de costado, y es más importante que la tarea.** Correr la suite pgTAP contra el **stack local** por primera vez —el hosted ya se corría— hizo fallar dos aserciones que ahí pasan:

```
# Failed test 19: "anon NO puede SELECT workouts (deliberado: SPA privada tras login)"
# Failed test  8: "anon sigue sin poder leer exercises"
#         have: true
#         want: false
```

**El stack local era más permisivo que producción.** Supabase expone las tablas nuevas de `public` a `anon`/`authenticated` por un default de plataforma (`[api] auto_expose_new_tables`, comentado en `config.toml`, así que aplica el default), y **ese default sólo se aplica en el stack local**: `db push` no lo aplica. El encabezado de `0003` ya lo decía, textualmente: quería migraciones "autosuficientes y portables a cualquier Postgres, sin depender de un default que puede cambiar". **Pero `0003` lo aplicó a los `GRANT` de `authenticated` y `service_role` y nunca revocó `anon`**: la intención estaba escrita y no estaba en el SQL. La consecuencia no es cosmética —cualquier Postgres con el default de Supabase deja a `anon` leer workouts y ejercicios— y además el entorno donde se prueba no se comportaba como producción, o sea que la suite no podía estar en verde donde se trabaja.

**`0010` lo revoca explícito**, que es portable a cualquier Postgres y no depende del default. Va después de `0009` a propósito: la tabla nueva nace expuesta en local. **`auto_expose_new_tables = false` en `config.toml` es la mitad durable y quedó recomendada y no aplicada**: necesita un reset del stack, y eso borraría la cuenta y los entrenamientos con los que el usuario está probando la app en este momento.

**Dos errores míos en el test, y los dos valen por el mismo motivo.**

1. Dejé la sesión con el rol `authenticated` al salir de cada bloque, así que las aserciones no podían leer su propia tabla temporal (`permission denied for table t_ctx`). El patrón del resto de la suite vuelve a `postgres` al terminar cada `do`; el mío no.
2. **Y al corregirlo metí la pata justo en el caso que más importa.** Puse la restauración de rol en los nueve bloques, incluido el de RLS —cuya razón de ser es dejar la sesión **como B** para que la aserción mida lo que B ve—. Corriendo como superusuario la lectura atraviesa RLS y ve todo, así que **"B no ve ningún objetivo de A" pasaba siempre**. Lo destapó el `have: 3, want: 0`. Queda como la única excepción al patrón, comentada con esas palabras, porque es exactamente la clase de "arreglo" que alguien podría repetir.

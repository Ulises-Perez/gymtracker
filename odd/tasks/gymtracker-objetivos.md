# Objetivo por ejercicio y secciones en el selector

**Estado:** **Cerrada** (2026-10-13). **O1** a **O6** cerradas, con O5 en `21fa2e3`. Alcance nuevo pedido por el usuario después del cierre de la Fase 3 del MVP (`odd/tasks/gymtracker-mvp.md`, `L28`).

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

- **S6 · La línea de "último".** Pedido textual: "falta que cuando muetre que fue lo ultimo vaya 4rep y cantidad max de kg osea 30kg ponele". La tarjeta muestra, de la sesión anterior, **las repeticiones de la serie más pesada y ese peso** — "último: 4 × 30 kg" — en vez de la lista completa de series. **Cambia una decisión previa de T3.6a**, que mostraba todas a propósito: el razonamiento era que un drop set son dos números distintos y promediarlos diría que levantes algo que nunca levantaste, y sigue siendo cierto — pero la lista se volvió larga y dejó de leerse, que es lo contrario de lo que buscaba. El peso que queda **sigue siendo uno que el usuario levantó**: es el de la serie más pesada, no un promedio. Si hay dos series con el mismo peso gana la de más repeticiones, porque es la que dice más sobre lo que puede hacer.


## Tasks

| ID | Qué | S# | Ruta | Commit |
| --- | --- | --- | --- | --- |
| O1 | El selector por secciones (UI, sin base) | S1 | cliente | `5372d35` |
| O2 | Servidor: tabla de objetivos + `save_workout` (migración + pgTAP + hosted) | S2, S4 | hosted | `ba28a6b` |
| O3 | Cliente: el draft (con migración de formato), el schema y el payload | S2, S4 | cliente | `74fcccb` |
| O4 | La UI del objetivo: los tres campos, en la tarjeta | S2, S4 | cliente | `732a9ca` |
| O5 | E2E del objetivo | S2 | e2e | `21fa2e3` |
| O6 · La línea de "último": reps de la serie más pesada y ese peso | S6 | cliente | `6f31dff` |

### Detalle por tarea

- [x] **O1** El selector por secciones. **Cerrada** en `5372d35`, 3 tests nuevos. La lista plana pasó a ser secciones con encabezado por grupo muscular, en el orden en que el catálogo los devuelve, y cada ejercicio **adentro** de la suya; lo que no tiene grupo va último, en una sección propia, porque un ejercicio propio se puede crear sin grupo y dejarlo afuera lo escondería. Los chips se mantienen filtrando qué secciones se ven. La jerarquía se anuncia (la sección se nombra y nombra su lista). **Dos cosas aparecieron por correr los tests contra el selector viejo**: la versión plana renderizaba la lista **aunque estuviera vacía** (decisión de T3.5), y con secciones no hay lista cuando nada coincide —correcto, una sección vacía sería ruido— pero el helper esperaba una y dos tests ajenos a secciones se colgaron 5 s; y el fixture de grupos estaba en un orden que el servidor **nunca devuelve** (los ordena alfabéticamente), así que mis aserciones fijaban un layout inexistente. Ver `L4`.
- [x] **O2** Servidor: `workout_exercise_targets` y el paso de `save_workout` que la escribe, en la misma transacción que las series y los récords. **Cerrada** en `ba28a6b`. **`Files=5, Tests=73, Result: PASS` contra la base local y contra el proyecto hosted**, con RED observado antes (la tabla no existía, 13/13 fallidas). La clave lleva la **posición** porque el objetivo es de la tarjeta y el mismo ejercicio puede aparecer dos veces. Los tres valores son opcionales e independientes, y **`min < max` no se valida a propósito**: se tipean de a uno, y un CHECK convertiría un rango a medio escribir en un guardado que falla entero. De paso apareció un defecto de seguridad preexistente: el stack local era más permisivo que producción (ver `L5` y la migración `0010`).
- [x] **O3** Cliente: el objetivo en el draft (con **migración de formato a `version: 2`**), en el schema Zod y en `toSaveWorkoutPayload`. **Cerrada** en `74fcccb`, 11 tests nuevos (274 → **285/285 en 34 archivos**), typecheck y lint limpios. **RED observado** en los tres archivos antes de implementar. Lo que importa del diseño: el payload numera los objetivos por la **posición de la tarjeta** y no por su lugar en el array — numerarlos por orden de aparición archivaría el objetivo contra el ejercicio equivocado el día que el mismo ejercicio aparezca dos veces, que es justo el día para el que existe la posición en la clave. Y una tarjeta con los tres campos vacíos **no viaja**: es una tarjeta que nunca se completó, y una fila de tres nulos no diría nada y sería igual una fila. Ver `L6`.
- [x] **O4** La UI del objetivo: los tres campos **en la tarjeta**, con `NumberCell` (el mismo control que las series) y el `onSetTarget` bajando por la lista hasta el store. **Cerrada** en `732a9ca`, 6 tests nuevos (286 → **292/292 en 34 archivos**). **Desviación declarada del pedido literal**: el usuario dijo "al elegir el ejercicio" y los campos quedaron en la tarjeta. Ponerlos en el selector habría cambiado su "un toque y afuera" (decisión de T3.5) y arrastrado la pantalla, sus tests y **la E2E entera**, y sobre todo habría dejado el objetivo **sin poder corregirse**: en la tarjeta se ajusta durante la sesión, que es cuando uno descubre que el rango estaba mal. El pedido se cumple igual, un toque después. Ver `L8`.
- [x] **O5** E2E: el flujo crítico suma el objetivo. **Cerrada** en `21fa2e3`. **`1 passed (23.2s)`** en Chromium con **292/292 unit tests**: la suite ahora escribe los tres campos del objetivo en la tarjeta antes de finalizar. **Por qué alcanza como prueba del camino entero**: un objetivo que el RPC no pueda leer **hace fallar el guardado completo**, así que los récords llegando al final —que sólo pueden venir de `save_workout`— son también la evidencia de que el objetivo llegó a la base. Ver `L9`.
- [x] **O6** La línea de "último" muestra **la serie más pesada y sus reps** ("último: 8 × 75 kg") en vez de la lista completa. **Cerrada** en `6f31dff`, 286/286 entonces. **Cambia una decisión previa de T3.6a**, que mostraba todas a propósito para que una serie descendente no se promediara en un número que nadie levantó: el razonamiento sigue siendo válido y **la lista se había vuelto lo bastante larga como para dejar de leerse**, que es lo contrario de para lo que estaba. El peso que queda sigue siendo uno realmente levantado. Este estado figuró como pendiente durante varios commits: **el commit existía y el registro no se había enterado** (lo encontró la revisión, `L39` de `gymtracker-mvp.md`).

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

---

### L6 · O3 cerrada: el objetivo en el draft, el schema y el payload (2026-10-13)

Cerrada en `74fcccb`. **285/285 unit tests en 34 archivos** (11 nuevos: 3 del schema, 4 del draft, 4 del payload), typecheck y lint limpios, con **RED observado en los tres archivos** antes de implementar.

**Qué entró**: los tres valores viven en la tarjeta del draft, viajan en el payload en snake_case y el draft pasó a `version: 2` con migración. Y una decisión que es la razón de todo el diseño: **el payload numera los objetivos por la posición de la tarjeta y no por su lugar en el array**. Numerarlos 1, 2, 3 por orden de aparición archivaría el objetivo contra el ejercicio equivocado el día que el mismo ejercicio aparezca dos veces — que es exactamente el día para el que existe la posición en la clave de la base.

**Una tarjeta con los tres campos vacíos no viaja**: es una tarjeta que el usuario nunca completó, y una fila de tres nulos no diría nada y sería igual una fila.

**La migración se escribió idempotente para las dos versiones viejas**: `customExercises` llegó en la v1 y los tres campos en la v2, así que a un draft de cualquiera de los dos builds le falta lo posterior. Leerlo como `undefined` llegaría al payload como `undefined` donde el servidor espera `null`: el tipo de falla que se ve como un guardado roto en el peor momento posible.

**Lo que costó, y lo anoto porque fue mi error.** Mi primera edición del test del store **reemplazó las aserciones y los cierres del test anterior** y dejó un `describe` adentro de un `it`, o sea un `Transform failed`. Como el archivo no compilaba, **sus tests no corrían**, y la primera lectura que hice fue "el RED está incompleto" en vez de "el archivo está roto". Lo destapó que los números no cerraban: 27 tests cuando esperaba alrededor de 39. Después aparecieron dos más de mi parte: referencié `PRESS_BANCA` cuando ese archivo llama a la constante `EXERCISE_ID`, y tipé el `emptyTarget` como *patch* (campos opcionales) cuando tiene que ser la forma completa. Los tres los marcó el typecheck o la propia suite, no yo.

**La lección que me llevo**: un archivo de test que no compila **no falla, no corre** — y un recuento de tests que no cierra es la única señal de que algo así pasó.

---

### L7 · Pedido del usuario (2026-10-13)

> Al agregar los pesos y repeticiones esta bien, falta que cuando muetre que fue lo ultimo vaya 4rep y cantidad max de kg osea 30kg ponele, ademas de eso continuemos con los demas fase 04 y 05

Se parte en dos, y la segunda mitad son las dos tareas que ya estaban abiertas de este documento: **S6/O6**, el cambio de la línea de "último", y **seguir con O4 y O5** (la UI del objetivo y su E2E), que es lo que "fase 04 y 05" nombra acá.

**Lo que confirma la primera mitad, y vale anotarlo**: "al agregar los pesos y repeticiones está bien" es la confirmación de que O4 va por donde va — los tres campos del objetivo (reps, mínimo, máximo) que ya están guardándose de punta a punta desde O3.

---

### L8 · O4 cerrada: los tres campos, en la tarjeta (2026-10-13)

Cerrada en `732a9ca`. **292/292 unit tests en 34 archivos**, typecheck y lint limpios, con los 6 tests nuevos pasando sólo después de la implementación.

**Desviación declarada del pedido literal.** El usuario dijo "al elegir el ejercicio", y los tres campos quedaron **en la tarjeta**, no dentro del selector. Los motivos, en orden de peso:

1. **Ponerlos en el selector habría cambiado su "un toque y afuera"** —una decisión de T3.5 explícita— y habría arrastrado la pantalla, sus tests y **la E2E entera**, que elige un ejercicio y espera ver la tarjeta.
2. **Y el objetivo habría quedado sin poder corregirse.** En el selector se escribe una vez, y equivocarse no tiene arreglo salvo borrar la tarjeta y volver a agregarla. En la tarjeta se ajusta durante la sesión, que es exactamente cuando uno se da cuenta de que el rango que puso está mal.

El pedido se cumple igual: se elige el ejercicio y **un toque después** se escribe el objetivo, y encima se puede editar.

**Lo que entró**: los tres campos en la tarjeta, con `NumberCell` —el mismo control que las series, así que se comportan igual con la coma decimal—, el `onSetTarget` bajando por la lista, y el store tomando el objetivo **junto con el ejercicio en la misma acción**: agregar la tarjeta y parchearla después mostraría una tarjeta sin rumbo durante un frame, y una interrupción en el medio dejaría una así.

**El test que más vale** es el que comprueba que un campo reporta **sólo a sí mismo**: los tres se escriben de a uno y un patch que mandara los otros como `undefined` borraría lo que ya estaba escrito. Es la misma trampa que documenta `updateSet`, y por eso se prueba una vez por camino.

---

### L9 · O5 cerrada: el objetivo en el navegador, y la feature cerrada (2026-10-13)

**`1 passed (23.2s)`** en Chromium, con **292/292 unit tests en 34 archivos**.

La suite escribe los tres campos del objetivo en la tarjeta antes de finalizar, y corre las mismas aserciones que ya corría.

**Por qué eso alcanza como prueba del camino entero, y no es una concesión.** Un objetivo que el RPC no pueda leer **hace fallar el guardado entero**, así que los récords llegando al final —que sólo pueden venir de `save_workout`— son también la evidencia de que el objetivo llegó a la base y no sólo a la pantalla. Es la misma propiedad que hace valiosa la aserción principal de esta suite desde T3.10: `53.3 kg de 1RM` es la fórmula de Epley aplicada en el servidor, y ningún código del cliente puede producir ese número.

**Y cubre algo sin buscarlo**: la fila nueva de la tarjeta cambió la altura de lo que la suite venía recorriendo, y el flujo que estaba en verde siguió en verde.

**La feature queda cerrada**: O1 a O6, con O2 y O3 verificadas contra la base real —**73 aserciones pgTAP contra local y contra el proyecto hosted**— y O5 contra un navegador real.

**Lo que no está, y no estaba pedido**: **reutilizar el objetivo de la vez pasada**. Hoy el objetivo vive en su sesión y se escribe de nuevo cada vez. Repetirlo es la idea obvia y necesita la pantalla de historial de la Fase 4 para ofrecerlo, así que queda anotado como el primer candidato de esa fase — no como una promesa de esta.

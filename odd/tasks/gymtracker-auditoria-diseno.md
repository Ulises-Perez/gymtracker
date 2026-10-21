# GymTracker · los arreglos de la primera auditoría de diseño

Feature: cerrar los cinco hallazgos prioritarios de la auditoría de diseño del 2026-10-21, más la
decisión de producto R2. El material del producto ya está; lo que falta es que la interfaz diga lo
que está pasando y que sus controles se puedan usar.

## Specs

### Alcance

- **S1 · El badge de sincronización tiene que verse.** Hoy `SyncBadge` se renderiza entre `<main>`
  y la nav fija (`src/components/layout/AppShell.tsx`), y queda **100% detrás de la nav**: la caja
  del badge mide y 694→732 y la nav ocupa y 678.5→740, medido a 360×740. En tres de las cuatro
  pantallas no hay ninguna señal visible de que un entrenamiento quedó pendiente. El texto del
  badge es `text-muted` sobre `bg-surface`, que mide **4.38:1**, bajo AA para texto normal: la
  frase exacta que muestra es `1 entrenamiento pendiente de sincronizar` y
  `N entrenamientos pendientes de sincronizar`.

- **S2 · Un guardado exitoso tiene que decir que se guardó.** Después de `Finalizar` sin récord
  nuevo, la pantalla queda con la fecha y el botón `Nuevo workout` y nada más: la pregunta de
  "¿se guardó?" se responde con silencio, y lo más ruidoso en pantalla es un botón rojo que
  *empieza otra sesión*. La confirmación tiene que ser **persistente** en el estado ya guardado
  (no un toast), tiene que **sobrevivir a que se descarten los récords**, y **no puede depender
  de que haya un récord nuevo**. La copia exacta es:
  `Guardado · 21/10/2026 · 3 ejercicios · 1 récord nuevo` (las partes variables son la fecha, la
  cantidad de ejercicios y la cantidad de récords; cuando no hay récords, la tercera parte no se
  escribe). Tiene que ofrecer un camino al historial.

- **S3 · Un link tiene que parecer un link.** El subrayado de los links es
  `decoration-rule hover:decoration-text`: `textDecorationColor: rgb(216,214,207)` sobre
  `rgb(243,242,238)` mide **1.30:1**, y WCAG 1.4.11 pide **3:1** para un gráfico que significa
  algo. Afecta a `← Historial`, `Entrá`, `Olvidé mi contraseña`, `Creá una`, el link del último
  entrenamiento y **el nombre del ejercicio**, que es el único camino al gráfico. El filete claro
  (`rule`) sigue siendo para separadores que no son links.

- **S4 · El asa de reordenar tiene que verse y tener nombre.** El asa es `text-rule` sobre papel:
  **1.30:1**, en un objetivo de 32 px de ancho. Es el único modo de reordenar una tarjeta, y hoy
  son seis puntos grises a un 30% de la luz que el resto de la pantalla usa.

- **S5 · El selector de ejercicios tiene que cerrarse.** La hoja es
  `fixed inset-x-0 bottom-0 max-h-[85vh]` y la nav es `fixed bottom-0` con 61 px de alto: el
  `Cancelar` mide y 676→724 y queda **tapado por la nav** (678.5→740), y la lista de resultados
  también se va debajo. La hoja no tiene ✕ en la cabecera. El `Cancelar` y el último resultado
  tienen que quedar **tocables**.

- **S6 · El valor tiene que estar sobre su renglón.** El campo es un renglón (`border-b`, sin
  caja), pero la etiqueta termina en y=156 y la regla está en y=210: el valor escrito queda
  **24 px arriba de su propia línea**. En el cuaderno, la escritura está *sobre* el renglón.

- **S7 · Las columnas se imprimen una vez por tarjeta.** Hoy cada serie reimprime `Reps` y `kg`
  (`src/components/workout/WorkoutExerciseCard.tsx`): cuatro series son ocho etiquetas redundantes
  y ~290 px de scroll, y el scroll es exactamente lo que grava la promesa de los diez segundos.
  Una serie tiene que ser **un renglón**.

- **S8 · R2: el Inicio cuenta las tarjetas.** `dashboard_summary()` cuenta
  `COUNT(DISTINCT we.exercise_id)` sobre `workout_exercises` (`0014`): con el mismo ejercicio en
  dos tarjetas —legal, y el selector no lo impide— el Inicio dice `1 ejercicio` mientras su
  detalle lista dos tarjetas. La decisión de la persona (2026-10-21) es que **el Inicio cuente las
  tarjetas**, que es lo que el detalle lista. Es una migración nueva contra el hosted.

### Invariantes que no se rompen

- La **marca de corrección** sobrevive: el valor anterior sigue tachado en su lugar, con el
  `Valor anterior:` en `sr-only`, y el nombre accesible de cada campo sigue siendo
  `Peso en kg serie N`.
- El **tachado** es un `2 px` de acento y el valor viejo queda en tinta apagada.
- Ningún control táctil baja de 48 px de alto; los links de texto inline quedan como están
  (no son controles táctiles principales, según el propio PRODUCT.md).
- El acento (#c7342a) no se usa para un estado: el chip seleccionado y la pestaña activa siguen
  en tinta.
- Cero sombras, cero degradados, cero `backdrop-filter` fuera de `.bottom-nav` y `.overlay`,
  cero radio de contenedor fuera de `rounded-sm`.
- La cola offline, el store, el contrato del servidor y el formato del borrador no se tocan: este
  tramo es de interfaz.

## Tasks

| Tarea | S# | Ruta | Commit |
| --- | --- | --- | --- |
| T1 · El badge de sincronización, por encima de la nav | S1 | inline | `ae5c2a1`, `fd4dcf8` |
| T2 · La confirmación del guardado | S2 | inline | `ae5c2a1` |
| T3 · El subrayado de los links y el asa de reordenar | S3, S4 | inline | `8b7e7c2` |
| T4 · La hoja del selector de ejercicios, por encima de la nav | S5 | inline | `5909dd1` |
| T5 · El valor sobre el renglón y las columnas una vez por tarjeta | S6, S7 | inline | `d143043` |
| T6 · R2: el Inicio cuenta las tarjetas (migración `0015`) | S8 | inline | `6de395c` |
| T7 · La verificación visual y el cierre | — | inline | `fd4dcf8` + este commit |

### Detalle por tarea

- **T1** · `src/components/layout/SyncBadge.tsx` y `src/components/layout/AppShell.tsx`. El badge
  tiene que quedar **por encima de la nav fija** y no tapado por ella: visible a 360×740 con la
  sesión encolada, con un color de texto de AA sobre su fondo, y sin tapar el contenido de la
  pantalla. El `role="status"` se mantiene: es una región viva y el usuario puede estar en otra
  pantalla.
- **T2** · `src/pages/WorkoutPage.tsx`. Un estado "guardado" que se pueda leer en cualquier
  momento, que sobreviva al descarte de los récords y que no dependa de que haya récords. La
  fecha es la del entrenamiento guardado, la cantidad de ejercicios es la de la sesión y la de
  récords es la del resultado del guardado. Un link al historial.
- **T3** · `src/index.css` y las pantallas que tienen links: `DashboardPage`, `ExerciseDetailPage`,
  `WorkoutDetailPage`, `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `NotFoundPage`. Una
  regla compartida para el subrayado de los links (no diez copias de la misma clase), por encima
  de 3:1. El asa de `SortableExerciseList` sube de contraste y gana un nombre accesible.
- **T4** · `src/components/workout/ExercisePickerDialog.tsx`. La hoja sube por encima de la nav
  (o ocupa la pantalla en el teléfono), la cabecera gana un ✕, y la lista deja de meter el último
  resultado debajo de la nav. El `Cancelar` y el último resultado se pueden tocar.
- **T5** · `src/components/ui/Input.tsx` y `src/components/workout/WorkoutExerciseCard.tsx`. El
  valor escrito queda **sobre** el filete inferior, con el área táctil de 48 px intacta. Los rótulos
  `Reps` y `kg` se imprimen **una vez por tarjeta**, arriba, y una serie es un renglón. La marca de
  corrección y los nombres accesibles no cambian.
- **T6** · `supabase/migrations/0015_*.sql` y `supabase/tests/0007_dashboard_summary_test.sql`. La
  función se reemplaza entera (es la de `0002`, reemplazada por `0014`). La cuenta pasa de
  ejercicios distintos a tarjetas. La suite gana la aserción del caso del mismo ejercicio en dos
  tarjetas. La migración **la aplica el padre** contra el hosted: el escritor no empuja.
  **Cerrada**: aplicada al hosted ✓ y verificada por la vía real (ver `L5`).
- **T7** · La captura de las pantallas afectadas en ego lite (360 px y 1280 px), el detector
  mecánico sobre lo cambiado, y el cierre del documento.

## Log

### L1 · El pedido original del usuario

*"Continuemos, que falta, ademas haz una auditoria de diseño con impeccable en ego lite"*

### L2 · Lo que la auditoría encontró, textual

*"El sync badge is 100% behind the fixed bottom nav"* · *"A successful save says nothing — the end
of the primary task is silent"* · *"Every navigation link is separated from body text by a 1.30 : 1
underline; the drag handle is invisible"* · *"The picker's dismiss control and its results live
under the fixed nav"* · *"The field is a line, but the writing floats 24 px above it — and every
set reprints its column labels"*.

### L3 · Las decisiones de la persona (2026-10-21)

*"Todo en una tanda"* · *"Los 5 hallazgos prioritarios"* · *"Contar tarjetas"* (para R2) · *"Lo reviso
yo con más permisos"* (para la CI).

### L4 · Lo que quedó resuelto antes de abrir este tramo

- La **Site URL y las Redirect URLs** del hosted: aplicadas el 2026-10-21 (`L64` del plan MVP).
- El **trigger de la CI**: escuchaba a un branch que no existe; ahora escucha todo push
  (`L65` del plan MVP). El resto del defecto es de la cuenta y lo ve la persona.
- La **auditoría**: dos subagentes ciegos, snapshot en `.impeccable/critique/`, **22/40**.

### L5 · R2 aplicado al hosted y verificado por la vía real (2026-10-21)

**La migración**: `0015_dashboard_exercise_count.sql` reemplaza `dashboard_summary()` entera —como
mandó la convención desde `0014`— y lo único que cambia es el conteo: `COUNT(*)` sobre las tarjetas
de la sesión, sin `DISTINCT` y sin mirar las series. El `diff` contra `0014` (normalizado) muestra
**dos** pedazos: la cabecera y la expresión del conteo. `DECLARE`, la racha, la tira de la semana,
los PRs recientes y el total quedan **idénticos byte a byte**, así que el contrato que el cliente
parsea (`src/schemas/dashboard.ts`) no cambia y el `GRANT` de `0003` sigue en pie.

**Aplicada**: `migration list --linked` mostró `0015` como la **única** pendiente y `db push
--linked` la aplicó; la lista de vuelta dice `local == remote` ✓.

**La prueba**: la suite pgTAP grew de 5 a 6 aserciones. La nueva es *"el mismo ejercicio en dos
tarjetas cuenta dos"*, y su fixture va **al final** a propósito: es la sesión más reciente, así que
si existiera antes cambiaría cuál es la última y las cinco aserciones previas quedarían midiendo
otra cosa.

**Lo que NO se pudo correr, y su motivo**: `supabase test db --linked` necesita el daemon de Docker
(`pg_prove` corre en un contenedor) y **Docker no está corriendo en esta máquina**. No hay RED ni
GREEN de esa aserción: la verificación fue de otra manera.

**La verificación que sí corrió, por la vía real** (`stats/audit/verify-r2.py`): contra el hosted, con
la misma RPC que usa la app:

- una sesión de **una** tarjeta con dos series → el Inicio cuenta **1**;
- una sesión de **dos tarjetas del mismo ejercicio** → el Inicio cuenta **2** ✓.

Eso es exactamente el caso que las dos pantallas se contradecían, y ahora lo que dice el Inicio es
lo que lista el detalle. **La deuda que queda anotada**: la aserción de pgTAP está escrita pero sin
ejecutar; la puede correr quien tenga Docker, con `supabase test db --linked`.

### L6 · El escritor de T1/T2 murió por un crash y no dejó cambios a medias

El primer escritor de T1/T2 terminó con `pi exited with code 3221226505` —el modo de fallo que este
proyecto ya conoce—. **El árbol se midió después del crash**, como manda la lección del plan: no
quedó ningún cambio a medias (el único archivo sin trackear era este documento), y el tramo se
relanzó limpio.

### L7 · Los cinco tramos, los cinco commits, y lo que el verificador independiente encontró (2026-10-21)

**El reparto**: los tramos se escribieron en paralelo, con superficies de edición disjuntas y la
regla de que un escritor no toca lo que otro está escribiendo. El primero —T1/T2— **murió por un
crash** (`pi exited with code 3221226505`), se midió el árbol (no había dejado cambios a medias) y
el tramo se relanzó limpio.

**Los commits** (cada uno un work unit revisable, con sus tests y sus docs al lado):

| Commit | Qué arregla |
| --- | --- |
| `8b7e7c2` | el subrayado de los links (1.30:1 → 4.83:1) y el asa de reordenar (invisible → 4.83:1, 32 → 44 px) |
| `ae5c2a1` | el badge de sincronización (100% detrás de la nav) y la confirmación del guardado |
| `5909dd1` | la hoja del selector de ejercicios (el `Cancelar` tapado por la nav) |
| `d143043` | el valor sobre su renglón y las columnas impresas una vez por tarjeta |
| `6de395c` | la migración `0015`: el Inicio cuenta las tarjetas |
| `fd4dcf8` | el badge anclado al borde de la nav, no a una distancia fija |

**El verificador independiente** (`gentle-ai-verify`, sobre el diff completo): **sin bloqueantes**.
Ocho observaciones, de las que se corrigieron tres y se anotaron las demás:

- **F1** (corregida): un comentario decía que la tinta sobre la superficie mide 15.8:1; son 14.48:1
  (el 15.8 es de la tinta sobre el **papel**). El número estaba copiado del par equivocado.
- **F2** (corregida): el test del subrayado leía la hoja de estilos desde el directorio de trabajo;
  ahora la busca subiendo hasta el `package.json`, y no pasa sólo desde la raíz.
- **F3** (corregida): la insignia conservaba su `mx-4` dentro de una banda que ya tenía `px-4`:
  quedaba a 32 px del borde donde el resto de la página está a 16.
- **F4** (corregida en `fd4dcf8`): la holgura entre la insignia y la nav era de **2.5 px** con un
  desplazamiento escrito en rems, y la nav **crece** cuando la persona agranda el texto. Ahora la
  insignia se apoya en el borde superior de la banda que lleva la nav.
- **F5** (anotada): después de un recargado la confirmación no vuelve a aparecer —porque la
  mutación reanudada vive en otra entrada de la caché—, igual que el panel de récords. Es la
  limitación que ya tenía el panel, no una regresión.
- **F6** (corregida): `DESIGN.md` mentía sobre el código —el `padding` del campo, el conteo de
  radios y la rampa de tipos, que decía `0.75rem` donde la prosa decía 11 px—. El detector signalaba
  esa contradicción como un hallazgo, y era el documento el que estaba mal.
- **F7** (corregida): los helpers de geometría estaban copiados en dos archivos de test; ahora
  viven en `src/testing/ruled-field.ts`.
- **F8** (informativa): la premisa del brief sobre "mover" un bloque de tests era falsa — era
  nuevo—. No se perdió nada.

**Las puertas**: **599/599 tests** en 62 archivos ✓ · typecheck ✓ · lint ✓ · build ✓ · el detector
mecánico sobre `src` devuelve **los mismos dos hallazgos de antes del tramo** (los dos falsos
positivos que la auditoría ya había medido) y **ninguno nuevo** ✓.

### L8 · La verificación visual, contra la URL pública y con la sesión real (2026-10-21)

La verificación no se hizo contra el build local: contra **https://gymtracker-devkiings-projects.vercel.app**,
con la cuenta de auditoría y con los estados que los arreglos tocan. Un detalle que apareció en el
camino y que casi arruina la medición: **el service worker sirve la build vieja** (el modo *prompt*
es a propósito: una recarga a mitad de serie perdería el entrenamiento), así que la primera pasada
midió la app vieja. La medición válida es la que acepta la versión nueva.

**Lo medido, con los píxeles delante**:

- **S1**: la insignia "1 entrenamiento pendiente de sincronizar" **se ve**, en tinta, apoyada en el
  borde superior de la nav. Antes ocupaba y 694→732 bajo una nav en 678.5: era **100% invisible**.
  Medido en la build nueva: insignia 640.5→678.5, nav 678.5→740 — se apoyan, no se pisan, y la
  distancia no depende de cuánto mida la nav.
- **S2**: al terminar la sesión aparece **"Guardado · 21/10/2026 · 1 ejercicio"** con el link
  **"Ver el historial"** debajo, y sobrevive a que se descarten los récords.
- **S3**: el subrayado de "Ver el historial" se ve en la tinta apagada, no en el filete claro.
- **S4**: el asa de reordenar se ve (seis puntos en tinta apagada, 44 px de ancho).
- **S5**: la hoja del selector ocupa la pantalla del teléfono, el **✕ dibujado** está en la
  cabecera, el **"Cancelar"** está abajo y se puede tocar, y el caret abre en "Buscar".
- **S6/S7**: los rótulos **"Reps"** y **"kg"** están **una vez por tarjeta**, las series son un
  renglón (`1ª 10 62.5 ✕`) y el valor descansa sobre el filete de la fila.

**Dos cosas que la verificación dejó anotadas y no se arreglan acá**:

1. **El anillo de foco es un rectángulo rojo alrededor de un campo que no tiene caja** —el buscador
   del selector, el peso de una serie—, y en el rojo del error. Eso es la declaración de foco de
   `DESIGN.md`, no una regresión de este tramo, y es la **pregunta 1** de la auditoría: si el rojo
   significa "esto fue reemplazado" o "esto confirma", ¿qué significa un anillo de foco rojo? La
   decisión es de la persona.
2. **El valor tachado y el rótulo de la columna se competitionan**: con los rótulos una vez por
   tarjeta, el tachado (que vive arriba del campo) queda justo debajo del rótulo de la columna. No
   se pisan —el renglón mide más que eso— pero conviven en el mismo aire.

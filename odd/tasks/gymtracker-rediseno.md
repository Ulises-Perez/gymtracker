# Rediseño visual de GymTracker

**Estado:** En curso (2026-10-14). Alcance nuevo, pedido después de cerrar la revisión completa del MVP (`odd/tasks/gymtracker-mvp.md`, `L39`).

**Guía:** la skill **impeccable** (`.agents/skills/impeccable`, v4.5.2). El enrutado que ella misma resolvió para este proyecto, que no tenía `PRODUCT.md` ni `DESIGN.md`: **`init` → `new-work` → la implementación → el detector una sola vez al final**. `PRODUCT.md` ya está escrito; `DESIGN.md` es de `new-work` y no se toca antes.

---

## Specs

- **S1 · Qué pidió el usuario.** Textual: "Haz un rediseño de toda la app, manteniendo consistencia de forma visual con la skill de impeccable". Y, del mensaje anterior: "quiero que en el inicio salga arriba el dia que es hoy", con una imagen de referencia que **el modelo no pudo ver** porque no procesa imágenes.

- **S2 · Mundo visual.** Decisión del usuario: **"Atlético, alto contraste"** — números grandes, energía de afiche, contraste alto. Es lo contrario de la app actual (oscura, violeta, medida) y la opción más memorable de las ofrecidas. En 360 px el riesgo declarado es que un afiche se vuelva una selva.

- **S3 · Alcance.** Decisión del usuario, textual: **"Puede cambiar absolutamente todo"**. No es sólo la piel: los flujos y las pantallas también. **Consecuencia declarada, y es la parte cara**: los **360 tests** y **la E2E** quedan en juego y se rehacen junto con el diseño. Un flujo movido sin su test nuevo deja de estar cubierto, aunque la suite siga en verde.

- **S4 · Dónde se usa.** Decisión del usuario: **"En el gimnasio, en el momento"**. Es la verdad del producto que quedó en `PRODUCT.md`, y la que decide los casos discutibles: entre un número grande y una tabla densa, gana el número grande; entre un dato más y un toque menos, gana el toque menos.

- **S5 · La fecha de hoy, arriba del inicio.** Requisito explícito del usuario. Se implementó una vez y **se revirtió** para no dejar el árbol en rojo antes de la decisión visual (`git checkout` de los dos archivos, con el árbol verde verificado). Entra como parte del rediseño del inicio, no como parche sobre el mundo que va a desaparecer.

- **S6 · Lo que NO cambia, pase lo que pase.** La verdad del producto (`PRODUCT.md`), el contenido, las funciones, los datos y las restricciones técnicas: **presupuesto de bundle de 180 kB**, offline-first, español en la interfaz y en los errores, RLS por usuario, la idempotencia de `save_workout` y el cálculo del 1RM en el servidor dentro de la misma transacción. **Un rediseño cambia el mundo visual, no la verdad del producto.**

---

## Tasks

| ID | Qué | S# | Ruta | Commit |
| --- | --- | --- | --- | --- |
| D1 | `init`: escribir `PRODUCT.md` con el usuario | S4 | skill | `b006a37` |
| D2 | `new-work`: elegir el mundo de reemplazo y escribir el contrato de dirección | S2, S6 | skill | `38b022f` |
| D3 | Los tokens y los componentes base | S2 | cliente | `c3de6df` + `70d13a0` |
| D4 | Las pantallas del flujo de entrenamiento | S2, S4 | cliente | `b2b7b67` · `0e758e8` · `36bace9` |
| D5 | Historial, detalle y progreso | S2 | cliente | pendiente |
| D6 | Inicio y perfil, con la fecha de hoy arriba (S5) | S2, S5 | cliente | pendiente |
| D7 | Las pantallas de autenticación | S2 | cliente | pendiente |
| D8 | Rehacer los tests y la E2E contra los flujos nuevos | S3 | cliente | pendiente |
| D9 | Verificación con capturas (desktop y mobile) y el detector, **una vez** | S2 | skill | pendiente |

### Detalle por tarea

- [x] **D1** `init`: `PRODUCT.md` en la raíz del proyecto, con la verdad del producto confirmada por el usuario (el escenario del gimnasio, las restricciones y las ausencias que no se pueden inventar). **Cerrada.** El paso 5 de `init` no aplica: `impeccable context` no reportó generación de imágenes, sólo conversores, así que el camino es **code-first** y **no se escribe ningún `buildPath`** — un valor tomado del silencio sería un default que nadie eligió.
- [x] **D2** `new-work`: el mundo de reemplazo elegido (**el cuaderno de entrenamiento**, `L4`/`L5`) y **el contrato de dirección** escrito en el brief de la superficie (`.impeccable/surfaces/src-pages-workoutpage-tsx.md`, `38b022f`). **Cerrada**, con la corrección de `L3`: en un mundo de reemplazo `DESIGN.md` se escribe **al final y desde lo construido**, así que cierra en D9.
- [x] **D3** Los tokens y los componentes base. **Cerrada** en dos tramos: los tokens con los valores movidos y **sin tocar un solo layout** (`c3de6df`), y los componentes base (`70d13a0`). La cara de despliegue (**Archivo**, autoalojada) entra acá, con su costo medido en `L6`.
- [x] **D4** El flujo de entrenamiento — donde la app promete el offline y donde el escenario de S4 es literal. **Cerrada** en tres tramos (D4a `b2b7b67`, D4b `0e758e8`, D4c el commit de este tramo), todos registrados abajo.
- [ ] **D5** Historial, detalle del entrenamiento y progreso por ejercicio (con la gráfica).
- [ ] **D6** Inicio y perfil, con **la fecha de hoy arriba** (S5) y la racha y los récords.
- [ ] **D7** Las pantallas de autenticación, que son la primera impresión.
- [ ] **D8** Rehacer los tests y la E2E contra los flujos nuevos (S3). **No es opcional**: es la mitad del costo de haber dicho "puede cambiar absolutamente todo".
- [ ] **D9** La verificación de la skill: capturas en desktop y mobile en una pasada, arreglar todo lo que muestren de una vez, confirmar con a lo sumo una ronda más, y **el detector una sola vez**, sobre lo cambiado.

---

## Log

### L1 · Pedido del usuario (2026-10-14)

> Haz un rediseño de toda la app, manteniendo consistencia de forma visual con la skill de impeccable.

### L2 · El sondeo, y las tres respuestas (2026-10-14)

La skill exige sondear una vez antes de inferir desde el brief, y sus **pasos de decisión siguen vivos**: que este harnés se describa como autónomo no es evidencia sobre esta sesión. Se preguntó una sola vez, con las tres cosas de las que depende todo lo demás:

1. **Mundo visual** → **"Atlético, alto contraste"**.
2. **Alcance** → *(respuesta libre)* **"Puede cambiar absolutamente todo"**.
3. **Dónde se usa** → **"En el gimnasio, en el momento"**.

**Una corrección de proceso propia**: la primera pregunta (el mundo visual) pertenece a `new-work`, no a `init` — la referencia de `init` dice explícitamente que no se pregunta por dirección estética ahí. La respuesta queda registrada donde se usa, en S2 y en D2, así que no se pierde; el orden en que se preguntó fue el equivocado, no el contenido.

**Estado del árbol al abrir este documento**: verde — 360/360 unit tests en 44 archivos, typecheck y lint limpios, y el trabajo de la revisión commiteado hasta `1d0b040`.

### L3 · El sorteo del mundo, y por qué no hay comps (2026-10-14)

`new-work` exige un sorteo antes de escribir código, y no como formalidad: **"escribir código antes de que este script corra y su asignación sea reconocida es una violación de contrato, sin importar el harnés, el modelo ni la presión de tiempo"**. Corrido:

- **Clave del sorteo: `aae13118`** (modo `operate`, catálogo `c3b204a1eed6`, 306/564 aprobados por humanos). Es reproducible con `concept-seed --scope direction --mode operate --from aae13118 --candidate-count 7`.
- **La asignación es el índice 6 de MI PROPIA lista de direcciones**, no una entrada del catálogo: "the assignment never points at a challenger… your top-ranked direction is what every run would ship, so the script decides which grounded direction gets built". O sea que **todavía falta derivar las siete** desde el mundo del usuario —el gimnasio, su gráfica, sus rituales— ordenadas por resonancia, y **construir la sexta**.
- **Y algo que la skill prohíbe explícitamente**: los siete no pueden salir de las herramientas que el usuario opera. Un tablero, un instrumento o una consola "vuelven como un disfraz de esa herramienta"; tienen que salir de las tradiciones gráficas, los lugares y los rituales de su mundo.
- **Seis desafíos repartidos** desde el catálogo, de familias deliberadamente distintas: campo de datamatics de Ikeda; muro de pósters en filas con la tarjeta enfocada; partitura de Labanotation; pase de embarque con tablero de puertas; superficie de consumo cálida con una sola acción saturada; y espécimen reticulado de Crouwel. **Ninguno se construye**: son material para fusionar y juzgar (gana / compite / se rechaza). Un rechazo **dona una disciplina** —no la ropa— a la dirección asignada, que se presenta ya elevada y con esas líneas nombradas.

**Dos consecuencias del modo que simplifican mucho el trabajo:**

1. **Esta superficie es `operate`** —una pantalla de trabajo, no de persuasión— y **no hay generación de imágenes** → **el camino es `code-led`**, sin comps ni compuertas de fidelidad contra una imagen. La ambición vive en el contrato de dirección (el primer viewport y la interacción de firma) y el revisor la audita **en el comportamiento**.
2. **`DESIGN.md` no se escribe ahora.** En un mundo de reemplazo la skill lo escribe **al final, desde lo construido**, porque "un reglamento escrito antes de construir se defiende de la realidad en vez de describirla". Lo que corresponde antes es **el contrato de dirección**, en el brief de la superficie.

**Corregido en el seguimiento**: D2 decía "elegir el mundo y escribir `DESIGN.md`"; es **elegir el mundo y escribir el contrato de dirección**, y `DESIGN.md` cierra la fase en D9.

**Nota de proceso que la skill exige decir en la primera respuesta, no esconder**: la ronda de decisión se presenta por la página de la skill o, cuando el harnés no puede sostener un `--wait` bloqueante —que es el caso acá, donde el shell devuelve los comandos largos en segundo plano—, **por la herramienta estructurada**. Es una sustitución declarada, no un atajo.

### L4 · Las siete direcciones, y el sorteo eligiendo la sexta (2026-10-14)

Derivadas del **mundo del usuario** —el gimnasio: su gráfica, sus lugares, sus rituales— y **no de las herramientas que opera**, que es lo que la skill prohíbe explícitamente. Ordenadas por resonancia con el escenario de S4 (entre series, una mano ocupada, sin señal):

1. **El cuaderno de entrenamiento.** La libreta donde el propio acto de anotar vive: renglones, columnas hechas a mano, tachones. Resuena porque **es la acción del producto**. Cómo se ve: papel de campo (no el crema de cuaderno, que es el default de la categoría), tinta oscura, regla impresa, la corrección visible. Primer viewport: la serie recién anotada, grande, con la anterior tachada al lado.
2. **La tabla de discos y porcentajes pegada en la pared.** El documento que todo gimnasio tiene. Resuena porque es **lo que se lee parado al lado del rack**. Cómo se ve: fondo casi blanco, retícula negra, figuras tabulares, una sola regla roja para el intento máximo. Primer viewport: la serie como una fila de tabla, con el número que importa en negrita.
3. **El póster de la competencia.** La cartelería del día de meet: condensada ultra negrita, un color caliente sobre negro. Resuena porque es **la aspiración** de quien entrena. Cómo se ve: negro, un amarillo o rojo de seguridad, grotesca condensada, filetes. Primer viewport: el récord, enorme, como un cartel.
4. **El hierro fundido antes de la web.** Chapas y catálogos de equipamiento: formas fundidas, esmalte, el número de la propia chapa. Resuena porque **es la materia** de la actividad. Cómo se ve: esmalte oscuro, el numeral pintado en la cara de la chapa, grotesca industrial chunky, el borde de la chapa como forma. Primer viewport: el peso como una chapa, no como un campo de texto.
5. **La señalética del gimnasio.** Plantilla y pintura: números de rack, líneas del piso, carteles de "no dejar discos". Resuena porque **es el lugar**. Cómo se ve: gris hormigón y negro con un fluorescente, mayúsculas de plantilla, bordes gastados. Primer viewport: cada serie rotulada como un número de rack.
6. **La pizarra del día.** El plan escrito donde todos lo ven, con los tildes de lo hecho. Resuena porque es **el ritual compartido** del gimnasio. Cómo se ve: negro de pizarra o blanco de marcador, una grilla visible, tildes que cierran. Primer viewport: la sesión como una fila de tildes que se van cerrando, con el ejercicio en curso más grande que el resto.
7. **El póster de anatomía.** El cuerpo en tinta con rótulos y líneas guía. Resuena porque **enseña**. Cómo se ve: tinta profunda sobre claro, filetes finos, versalitas, un color para el músculo que el ejercicio trabaja. Primer viewport: qué músculo trabaja, con la línea guía hasta el número.

**El sorteo asignó el índice 6** (`aae13118`): **la pizarra del día**. Y la asignación no es una entrada del catálogo, sale de mi lista: el script decide **cuál de mis direcciones se construye**, no una dirección ajena.

**Fusiones y veredictos de los seis desafíos** —material para juzgar, ninguno se construye tal cual:

- **Ikeda datamatics** → **se rechaza**: los datos como espectáculo no pueden llevar un registro (S4). **Dona una disciplina**: dos valores y la denegación del gris medio → la pizarra gana **dos tonos sin grises intermedios**.
- **Muro de pósters en filas** → **se rechaza**: es catálogo, no sesión. **Dona**: la tarjeta que crece al enfocarse → el ejercicio en curso.
- **Labanotation** → **compite**: que el tiempo suba por la pantalla es una idea real para una sesión, y la simetría bilateral ordena los lados del cuerpo; no gana porque vuelve la sesión una partitura que hay que aprender a leer.
- **Pase de embarque + tablero** → **se rechaza**: transporta ranking de vuelos, no registro de entrenamiento. **Dona**: la reranja en el lugar, que sirve cuando se corrige una serie ya anotada.
- **Superficie de consumo cálida** → **se rechaza, y es el más tentador**: es exactamente el default de la categoría que la skill lista como calibración fallida. **Dona**: el acento reservado **sólo** a lo accionable.
- **Espécimen reticulado de Crouwel** → **gana**: la retícula visible como prueba del sistema y las letras construidas celda por celda sobreviven a "dos valores, sin grises" y le dan a la pizarra **un sistema de construcción en vez de un estilo**.

**Lo que la dirección asignada se lleva de los rechazados, escrito como líneas propias**: dos tonos sin gris medio (de datamatics), la tarjeta que crece en el ejercicio en curso (del muro), la reranja en el lugar de una serie corregida (del tablero) y el acento reservado a lo accionable (de la superficie de consumo). Sin esas líneas, el rechazo fue adorno.

### L5 · El usuario eligió, y eligió mi candidata (2026-10-14)

De las cuatro cartas presentadas —la asignada por el sorteo, mi número uno, el desafío que ganó, y la salida convencional— **el usuario eligió "El cuaderno de entrenamiento", que era mi candidata número uno**.

**Eso es exactamente lo que la skill prevé**: "the assignment exists to refuse the model's ranking rut, never to outrank the user or the brief", y una dirección fijada por el usuario **le gana al sorteo, siempre**. La asignación hizo su trabajo —me obligó a derivar siete y a no construir la primera que se me ocurrió— y el usuario eligió otra. No hay nada que corregir.

**Lo que se hereda y lo que no.** El cuaderno se lleva del mundo asignado la disciplina que éste había ganado: **la corrección visible en el lugar** (que el destinatario rechazado donó) y **el acento reservado a lo accionable** (de la superficie de consumo). Lo que **no** entra es la retícula visible de Crouwel como sistema de construcción: el cuaderno ya trae la suya, que es el renglón impreso.

**El contrato de dirección quedó escrito en el brief de la superficie** (`src/pages/WorkoutPage.tsx`), con los seis bloques que la skill exige, la clave del sorteo y la línea `FINISH` textual. **La escena forzó la decisión difícil**: claro u oscuro no se elige por gusto — se escribe la escena (sótano, tubo duro, una mano) y ella decide. Un fondo oscuro con reflejos de tubo es un espejo; el papel mate no refleja y es lo que el objeto reemplazado ya era.

**Sin comps, por contrato y no por deriva**: superficie Operate + sin generación de imágenes → camino `code-led` ✓. La ambición vive en el primer viewport y en el momento memorable (ver una serie tacharse), y el revisor la audita **en el comportamiento**.

### L6 · El registro se pone al día, y los tokens que cambiaron la piel sin tocar un layout (2026-10-14)

**Una falta de proceso propia, primero**: entre `L5` y esta entrada hubo **cinco commits sin registrar** (`db683be`, `c3de6df`, `4b3a157`, `4bd1d0a`, `f35d06d`). El trabajo estaba hecho y verificado en el árbol; **el documento es el que se había quedado atrás**. Se anota porque el registro que no sigue al trabajo deja de ser el registro: la próxima vez que alguien lea "D2 pendiente" va a buscar trabajo que ya está hecho.

**`db683be` — el piso de oficio corrigió dos cosas que yo ya había escrito.** Dos llamadas del contrato de dirección no pasaban el piso: la etiqueta sobre un encabezado (sin excepción) y un `letter-spacing` fuera del límite. **El brief es el documento que se corrige, no el piso el que se ablanda.**

**`c3de6df` — los tokens.** Los **nombres** son los que las pantallas ya usaban (`bg`, `surface`, `text`, `muted`, `primary`…); lo que se movió fueron **los valores**, a propósito: **la app entera cambia de piel en un commit sin un solo cambio de layout**, y las pantallas migran al lenguaje del cuaderno —filas regladas en vez de tarjetas— **de a una**. Se suma **Archivo** (grotesca de imprenta, eje de peso hasta 900, figuras tabulares) autoalojada con `@fontsource-variable/archivo`: el piso prohíbe resolver un encabezado subiendo el peso de la letra de la interfaz.

**`4b3a157` + `4bd1d0a` — el peso de la letra: una alarma mía, mal medida, corregida en el mismo día.** Se alarmó que las dos caras traen todos sus subsets (`cyrillic`, `greek`, `vietnamese`) y que `dist` quedaba en **308 kB de woff2** para una app que sólo habla español. **Eso es peso de despliegue, no lo que un teléfono descarga**: los paquetes declaran `unicode-range`, el navegador pide sólo los rangos que el texto de la página usa, y el español nunca matchea cirílico → **el costo real de una sesión son los archivos latinos, ~66 kB**. Subsetear a mano no cambiaría nada de una sesión. **El error es el mismo que el método del bundle se escribió para prevenir: medir lo que hay en disco en vez de lo que se pide por la red.** Se revirtió el subsetting, se conservó la medición, y la nota quedó en `src/index.css` en vez de perderse.

**`f35d06d` — las superficies del navegador.** `color-scheme: light` (para que los controles nativos, la barra de scroll y el caret sigan la página y no el sistema operativo), la barra como margen reglado, `::selection` con el acento, `caret-color` con el acento, `:focus-visible` como **outline del acento declarado una sola vez** y `text-underline-offset` en los enlaces. Es lo que el piso llama la señal más barata de que una página se construyó en vez de armarse, y lo que casi todos saltean.

**Los componentes base (D3, este tramo).** Cuatro decisiones, todas derivadas del contrato y ninguna de gusto:

1. **El acento se queda fuera de la navegación.** La pestaña actual pasa a **tinta**, no a rojo: el rojo está reservado a **lo que fue reemplazado** y **a lo que se puede apretar**, y estar parado en un lugar es un **estado**, no una presión. Con el rojo en la barra, el rojo del tachado y el rojo del botón, el acento decía tres cosas y no decía ninguna. Se conserva la barrita superior como cue que sobrevive al gris (el test que la exige sigue verde).
2. **El foco se declara una sola vez.** El outline global de `index.css` es el tratamiento de foco de toda la app; **el botón y el campo dejaron de pintar su propio `ring`**. Hacerlo por control era la segunda declaración de la misma regla, y además medía mal: el anillo `primary-soft` sobre papel da **2.4:1** y el mínimo para contraste no textual es **3:1**.
3. **El botón oscurece al pasar por encima, no aclara.** `primary-soft` es un tinte **para fondo**: blanco sobre él da **2.4:1** y no lleva etiqueta. Blanco sobre el rojo son **5.3:1** y sobre el rojo apretado **7.2:1**. Se agrega `primary-strong`, que coincide en valor con `danger` por aritmética (los dos son el mismo rojo bajado hasta que el blanco pasa AA) y se mantiene como **nombre separado** porque son dos significados distintos.
4. **El campo es un renglón, no una caja.** Se va el `ring-white/15` —que en el mundo oscuro dibujaba un borde y sobre papel es **invisible**— y queda la **línea impresa** del cuaderno. El error sigue siendo la única cosa que usa el rojo en un formulario, y sigue siendo una región viva.

**Lo que este tramo NO hace, y hay que decirlo**: hay pantallas que todavía llevan las clases del mundo viejo —`ring-white/15`, `text-primary-soft` en enlaces— y que **sobre papel se leen mal**. Los tokens cambiaron la piel de toda la app, pero la migración de las pantallas es **D4 a D7**, una por una. **El árbol está verde; la app está a medio vestir, y es el estado previsto de este punto del plan.**

**Verificación del tramo**: **360/360 unit tests en 44 archivos** (los mismos 360 que antes: el tramo no agrega comportamiento, cambia la piel y el foco), typecheck limpio, lint limpio, `prettier --check` limpio. Commit `70d13a0`. **Lo que sigue: D4** (el flujo de entrenamiento), que es donde el escenario de S4 es literal y donde vive el primer viewport de la fecha.

### L7 · D4, primer tramo: la fila de serie y el tachado (2026-10-14)

**Lo que se hizo, y por qué arranca por acá.** D4 es el flujo de entrenamiento entero. Se corta en tramos y el primero es **la fila de serie**, porque es donde vive **el momento memorable del mundo**: el tachado. Sin eso, el resto de la pantalla es una lista de tarjetas prolijas, que es exactamente el arreglo por defecto del que el contrato se quiere salir.

**La regla nueva, con RED observado antes de escribirla**: *al corregir una serie, el valor reemplazado queda a la vista, tachado, y el nuevo queda en su lugar.* Dos tests nuevos en `WorkoutExerciseCard.test.tsx`, uno por regla: el tachado aparece con la corrección (`FireEvent.focus` → `change` → `<s>` con el valor viejo y el campo con el nuevo), y **una fila intacta no tacha nada** — el tachado es el registro de una corrección, no una decoración que la fila lleva siempre. Los dos casos que la regla nombra están cubiertos: **el tachado sobrevive el resto del tipeo** (`102,5` pasa por `1` y `10`, y lo tachado sigue siendo el 100 real, no cada tecla) y **volver al valor original no tacha nada**.

**Dos decisiones de implementación que importan más de lo que parecen:**

1. **El valor se toma cuando el dedo llega al campo, no en cada tecla.** El tachado marca **el valor que estaba de verdad en el renglón** cuando el usuario fue a corregirlo. Una tecla no es una corrección: de `100` a `102,5` el campo pasa por `1` y `10`, y marcar esos sería marcar el tipeo. Se toma en `focus`, se compara contra lo que se escribió, y si vuelve al original el tachado desaparece solo.
2. **Vive en la fila, no en el borrador.** Es lo que pasó **delante del usuario**, no parte de la sesión: persistirlo sería meter una decisión de pantalla en el payload que el servidor conoce (y en una tabla que no tiene esa columna). Se pierde con un recargado, y es honesto que se pierda.
3. **Para el lector de pantalla se anuncia, no se esconde.** El `<s>` va con un `Valor anterior:` oculto: la corrección **es información**, y a quien no ve el tachado es justo a quien se le perdería. La alternativa cómoda —`aria-hidden`— habría borrado el dato.

**El mundo, en los componentes que toca este tramo**: la tarjeta deja de ser una tarjeta (`bg-surface rounded-lg p-4`) y pasa a ser **un bloque reglado** con filete de tinta arriba; el nombre del ejercicio sube a **la cara de despliegue** (Archivo, `extrabold uppercase`), que es lo que el piso de oficio pide y no un peso más de la interfaz; **cada serie es un renglón con su filete abajo**, con el número en el margen; **los campos son líneas regladas** y no cajas, con `tabular` para que la columna no baile mientras se escribe; y el asa de arrastre deja de ser el carácter braille `⠿` y pasa a ser **un glifo dibujado**, porque el proyecto ya había decidido contra los glifos como iconos y ese era el último que quedaba.

**Lo que queda de D4a**: nada. **Lo que sigue (D4b), y hay una decisión que tomar antes de tocarlo**: el contrato de dirección dice que **la fecha de hoy ES el encabezado** del primer viewport del flujo. Hoy esa pantalla tiene un `<h1>Entrenar</h1>` y **el test de rutas la identifica justamente por ese encabezado** — y la Fase 5 dejó una lección escrita: *"un `h1` que cambia con el reloj no lo puede buscar un test ni usar alguien para orientarse"*. Las dos cosas se pueden sostener a la vez (la fecha como `<h1>` visible y **un nombre accesible estable** para la pantalla, sin rótulo impreso encima), pero **reemplaza una decisión registrada**, así que se decide, no se deriva.

### L8 · D4, segundo tramo: la fecha como encabezado, y el nombre que no se mueve (2026-10-14)

**La decisión que había que tomar, y la tomó el usuario**: el contrato de dirección dice que **la fecha de hoy ES el encabezado** del primer viewport del flujo de entrenamiento, y esa pantalla se identificaba hasta ahora por `<h1>Entrenar</h1>` — con el test de rutas colgando de ese encabezado y con una lección escrita en el cierre de la Fase 5: *"un `h1` que cambia con el reloj no lo puede buscar un test ni usar alguien para orientarse"*. **El usuario eligió la fecha como `<h1>` visible, con un nombre accesible estable en la sección.** Las dos necesidades conviven: la página del cuaderno abre con el día al que pertenece, y la orientación y el test se apoyan en un **`role="region"` con `aria-label="Entrenar"`**, que no se mueve nunca. El test de rutas pasa a buscar la región y no el encabezado.

**Por qué la fecha no se "calcula en la pantalla"**: sale de **`formatLongDate`**, una función pura con su propia suite, al lado de `localIsoDate` y por el mismo motivo. Tres reglas, con RED observado primero (`formatLongDate is not a function`):

1. **"Miércoles, 14 de octubre"**: en español, sin año (la página es de hoy), con el día de la semana adelante y **capitalizada**, porque es un título y no una frase adentro de un renglón.
2. **La lee del reloj local y nunca del instante UTC**: a las 22:00 en Argentina el instante UTC ya es mañana, y una fecha leída de ahí adelantaría un día el encabezado de la sesión de esta noche. **Es la misma trampa que `localIsoDate` existe para evitar**, y sólo aparece de noche y al oeste de Greenwich.
3. **El día de un dígito va sin relleno**: "Lunes, 5 de enero", no "05".

**Los controles de la pantalla, migrados al mundo**: los siete botones del flujo (`Reintentar`, `Sí, descartarlo`, `Cancelar`, `Nuevo workout`, `Agregar ejercicio`, `Descanso`, `Finalizar`) dejan el `ring-white/15` —que sobre papel era **un borde invisible**— y pasan a filete reglado (`border-rule`), con el acento rojo reservado a lo que de verdad avanza el entrenamiento (`Nuevo workout`, `Finalizar`). Los radios bajan a `rounded-sm`: en este mundo los radios son de control, no de contenedor.

**Lo que este tramo NO toca, y es el siguiente**: **el selector de ejercicios** (`ExercisePickerDialog`) sigue con las clases del mundo viejo, igual que Inicio, historial, perfil y las pantallas de autenticación. Es **D4c** en el caso del selector y D5/D6/D7 para el resto. **Un dato que sí queda decidido por el contrato y que D4c tiene que respetar**: el selector es un diálogo que **se revisa contra el piso de oficio** ("ningún modal para una tarea que no necesita interrupción ni foco protegido"), o sea que la pregunta no es cómo se viste el modal, sino **si tiene que seguir siendo un modal**.

**Verificación del tramo**: **365/365 unit tests en 44 archivos** (362 + los tres de `formatLongDate`), typecheck y lint limpios. Commits: `b2b7b67`+`5fe5289` (D4a) y el de este tramo (D4b).

### L9 · D4, tercer tramo: el selector y los récords, y la pregunta que el piso de oficio obliga a contestar (2026-10-14)

**La pregunta, contestada antes de vestir nada**: el piso de oficio pide revisar todo diálogo contra *"ningún modal para una tarea que no necesita interrupción ni foco protegido"*. **Sigue siendo un diálogo**, y no por costumbre: adentro hay **un campo de búsqueda y un formulario de alta que puede quedar a medio escribir**, o sea foco que proteger y un cierre que tiene que ser deliberado. Lo que el piso prohíbe es el modal de una tarea que no necesita ninguna de las dos. **La pregunta era si seguía siendo modal, no cómo se vestía el modal** — y la respuesta quedó escrita en el código, al lado del `Dialog.Content`, para que el próximo que lo lea no tenga que rehacer el razonamiento.

**Lo que cambió de ropa, y todo sale del mundo**: el velo pasa de `bg-black/60` a **`bg-text/60`** (tinta, no negro); la hoja deja de ser una tarjeta flotante redondeada y pasa a ser **una esquina de página: fondo de papel, filete arriba y esquinas rectas** (`rounded-t-2xl` → nada), porque en este mundo los radios son de control y no de contenedor; el título sube a la **cara de despliegue**; **los ejercicios son renglones reglados** con su filete, no botones en cajas; el formulario de alta es un **bloque reglado**, y el `select` vuelve a ser **un renglón** como el resto de los campos.

**Una decisión de acento, la misma que en la navegación**: **el chip seleccionado es tinta, no rojo**. Con seis grupos musculares, pintar el filtro activo con el acento gastaba el rojo —que está reservado a **lo que fue reemplazado** y **a lo que avanza el entrenamiento**— en decir cuál filtro está puesto. El chip sigue anunciando su estado por `aria-pressed` y no sólo por color.

**Los récords (`PersonalRecords`) también son del flujo, y acá el acento sí corresponde**: el panel muestra **valores que fueron reemplazados por otros mejores**, que es exactamente lo que el rojo significa. Pasa de tarjeta con anillo a **filete rojo al margen** (una sola forma de elevación: borde, no borde más sombra) y **pierde el emoji de festejo** — el proyecto ya había decidido contra los glifos como iconos, y en un cuaderno impreso un confeti es una ilustración que nadie dibujó. Las frases se conservan **palabra por palabra** (`antes 110.0 kg → 116.7 kg de 1RM`), porque los tests las afirman y porque el texto no era el problema.

**D4 cerrada**: los cinco componentes del flujo (pantalla, tarjeta, lista ordenable, selector y récords) están en el mundo nuevo. **Lo que sigue es D5** (historial, detalle del entrenamiento y progreso por ejercicio), donde quedan cuatro pantallas con el `ring-white/15` del mundo viejo.

### L10 · La medición: el bundle inicial, y el peso real de la cara nueva (2026-10-14)

Con el mundo ya en el flujo de entrenamiento, se midió como manda el método congelado (`scripts/measure-bundle.mjs`, que está commiteado: todo lo que `dist/index.html` referencia, JS **y** CSS, gzip nivel 9; presupuesto **180 kB** de S11):

**`INICIAL (JS + CSS, gzip 9): 119.24 kB de 180`** — `86.50` el bundle, `22.89` el chunk de hooks, `6.60` el CSS, `3.25` el runtime de JSX. Contra el último cierre registrado (**118.72** en el cierre de la Fase 4; el auditor había medido 118.81 con otro método, que es justo el motivo por el que el script existe) el rediseño entero de **D3 y D4 costó +0.52 kB al inicial**, porque todo el trabajo de pantalla cae en chunks diferidos. **S11 sigue cumplido con margen.**

**Las fuentes, medida la parte que importa.** `dist` queda con **308 kB de woff2** —las dos caras traen cyrillic, greek y vietnamese— y eso es **peso de despliegue, no de sesión**. Se comprobó leyendo los `unicode-range` del CSS construido, y no de memoria: **el español entero entra en el subset `latin`** (las ranges declaradas cubren `U+0000-00FF`, o sea `ñ á é í ó ú ü ¿ ¡ ª º ×` y el resto de Latin-1). Una sesión pide entonces **48 kB de Inter + 36 kB de Archivo = 84 kB**. La nota vieja de `src/index.css` decía ~66 kB y era **de antes de Archivo**: se midió de nuevo en vez de arrastrar el número.

**Un hallazgo chico y real de esa lectura**: **la flecha `→` de la frase de los récords (`antes 75.0 kg → 82.5 kg de 1RM`) no está en el subset `latin` de ninguna de las dos caras** — las ranges declaran `U+2191` y `U+2193`, y no `U+2192` — así que se dibuja con la fuente del sistema. **No se toca ahora**: queda anotado para la revisión final, porque un signo que cambia de letra en medio de una frase es exactamente lo que el detector mira, y arreglarlo pide decidir entre cambiar el signo o elegir otro.

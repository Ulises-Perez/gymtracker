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
| D1 | `init`: escribir `PRODUCT.md` con el usuario | S4 | skill | pendiente |
| D2 | `new-work`: elegir el mundo de reemplazo y escribir `DESIGN.md` | S2, S6 | skill | pendiente |
| D3 | Los tokens y los componentes base | S2 | cliente | pendiente |
| D4 | Las pantallas del flujo de entrenamiento | S2, S4 | cliente | pendiente |
| D5 | Historial, detalle y progreso | S2 | cliente | pendiente |
| D6 | Inicio y perfil, con la fecha de hoy arriba (S5) | S2, S5 | cliente | pendiente |
| D7 | Las pantallas de autenticación | S2 | cliente | pendiente |
| D8 | Rehacer los tests y la E2E contra los flujos nuevos | S3 | cliente | pendiente |
| D9 | Verificación con capturas (desktop y mobile) y el detector, **una vez** | S2 | skill | pendiente |

### Detalle por tarea

- [x] **D1** `init`: `PRODUCT.md` en la raíz del proyecto, con la verdad del producto confirmada por el usuario (el escenario del gimnasio, las restricciones y las ausencias que no se pueden inventar). **Cerrada.** El paso 5 de `init` no aplica: `impeccable context` no reportó generación de imágenes, sólo conversores, así que el camino es **code-first** y **no se escribe ningún `buildPath`** — un valor tomado del silencio sería un default que nadie eligió.
- [ ] **D2** `new-work`: elegir el mundo de reemplazo y escribir `DESIGN.md`. Es donde vive la decisión visual de S2, y **la mirada actual entra como anti-referencia**, no como base.
- [ ] **D3** Los tokens y los componentes base. Antes de las pantallas, porque el mundo nuevo tiene que existir una sola vez.
- [ ] **D4** El flujo de entrenamiento — donde la app promete el offline y donde el escenario de S4 es literal.
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

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

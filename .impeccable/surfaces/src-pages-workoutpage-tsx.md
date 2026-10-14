---
version: 1
slug: "src-pages-workoutpage-tsx"
primary_target: "src/pages/WorkoutPage.tsx"
related_targets: []
---

# Surface brief — el flujo de entrenamiento (`src/pages/WorkoutPage.tsx`)

**Mundo elegido:** el cuaderno de entrenamiento (primera de siete por resonancia; el sorteo `aae13118` había asignado la pizarra del día y **el usuario eligió ésta**, que es su prerrogativa).

**Modo:** Operate. Pantalla de trabajo, no de persuasión: el visitante completa una tarea.
**Camino:** code-led (modo Operate, sin generación de imágenes). Sin comps y sin compuertas contra una imagen.

## La escena que decide, en una oración

Alguien entrenando en un sótano a las siete de la tarde, bajo una luz de tubo dura, con el teléfono en una mano y una barra en la otra, mirando la pantalla de reojo entre series.

**Esa frase fuerza el claro.** Un fondo oscuro con reflejos de tubo es un espejo; el papel mate no refleja y es lo que el objeto reemplazado ya era. La decisión no es una preferencia: es la consecuencia de la escena.

## Contrato de dirección

**THESIS.** Un registro de entrenamiento que se parece al objeto que reemplaza. El número que acabás de escribir es lo más grande de la pantalla, y **el anterior sigue visible, tachado, donde estaba**. Refuta el arreglo por defecto de la categoría: tarjetas suaves sobre un fondo claro con un acento de color.

**OWN-WORLD.** Papel de libreta de campo, off-white frío, con **renglón impreso y línea de margen** en tinta tenue; texto en tinta oscura; **rojo de corrección reservado a lo único que fue reemplazado**. El lenguaje de componentes son filas regladas, el margen numerado a mano, y el tachado como **estado**, no como aviso.

**STORY.** Alguien a mitad de una serie lee el peso que levantó la vez pasada sin apuntar, escribe el nuevo, y ve el anterior tacharse. Entiende que la sesión se está registrando mientras la hace, y que nada se perdió mientras no había señal.

**FIRST VIEWPORT.** **La fecha de hoy ES el encabezado.** "Miércoles, 14 de octubre" es lo primero y lo más grande, sin rótulo encima ni debajo: el piso de oficio prohíbe la etiqueta sobre un encabezado sin excepción, y la fecha se gana el lugar siendo el título en vez de anunciarlo. Debajo, el ejercicio en curso como el bloque mayor, **su próxima serie como un renglón vacío con la anterior justo encima y tachada**. La acción primaria —agregar serie— abajo, al alcance del pulgar, en figuras tabulares que no bailan al escribirse.

**FORM.** El cuaderno de entrenamiento, primero de siete por resonancia; clave del sorteo `aae13118`; elegido por el usuario por encima de la dirección asignada.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Color y tipografía

**Estrategia de color: contenida.** El neutro sale del mundo (el papel) y se tinta desde ahí, con **un solo acento**: el rojo de corrección, reservado a lo tachado y a lo accionable. No hay segundo acento ni color decorativo.

**Una cara de despliegue, autoalojada, y el costo declarado.** El piso de oficio es explícito: "the closest installed font is a failure, not a fallback", y un encabezado que se hace subiendo el peso de la letra de la interfaz es exactamente eso. Se suma **Archivo** —grotesca de imprenta, eje de peso variable hasta 900, figuras tabulares— servida desde los archivos del proyecto con `@font-face`, nunca desde un host externo. No está en la lista de caras que la skill marca como default de entrenamiento. **Cuesta**: un woff2 subseteado son del orden de 20 kB, y el bundle inicial hoy está en 118.69 kB contra un tope de 180 que es verdad del producto. Si no entra, se reporta la cifra exacta antes de decidir nada.

**Lo demás que el piso de oficio prohíbe y este mundo tiene que respetar**, anotado para no redescubrirlo en la revisión final: nada de tarjetas dentro de tarjetas (hoy la app los tiene, y se van); nada de sombras de desplazamiento duro ni de brillos de color sin desplazamiento; elevación declarada **una sola vez**, borde o sombra y no las dos; radios de tarjeta entre 12 y 16 px, con las píldoras sólo para controles chicos; `letter-spacing` nunca más cerrado que -0.04em; un solo momento animado de autor y no una entrada idéntica por sección; y ningún modal para una tarea que no necesita interrupción ni foco protegido — lo que hoy son diálogos se revisa contra eso.

**Y lo que el piso pide y casi todos saltean**, que acá es trabajo de D3: **las superficies del navegador también llevan el diseño** — selección de texto, el cursor de escritura, la barra de scroll, el anillo de foco, el subrayado y los números tabulares salen con defaults que no pertenecen a ningún sistema. Tenirlos con la paleta es la señal más barata de que una página se construyó en vez de armarse.

## El momento memorable

**Ver tacharse una serie.** Corregís un peso ya anotado y el anterior no desaparece: queda debajo, cruzado, en el lugar exacto donde estaba. Es el tachado del cuaderno de verdad, y es lo único de la pantalla que dice "esto estuvo mal y se corrigió" sin decir una palabra.

## Sin resolver

- El toggle kg/lb sigue sin interfaz (T4.4b): la unidad se va a mostrar con el mundo nuevo, no antes.
- Cuántas series pasadas se ven antes de que la fila se vuelva una lista: se decide contra la pantalla, en el primer viewport.

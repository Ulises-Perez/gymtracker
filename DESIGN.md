---
name: GymTracker
description: 'El cuaderno de entrenamiento: papel de campo, renglón impreso y un solo rojo para lo que fue reemplazado.'
colors:
  bg: '#f3f2ee'
  surface: '#e9e7e1'
  text: '#16171b'
  muted: '#6b6a66'
  rule: '#d8d6cf'
  primary: '#c7342a'
  primary-strong: '#a4291f'
  primary-soft: '#e0847c'
  danger: '#a4291f'
typography:
  display:
    fontFamily: "'Archivo Variable', 'Inter Variable', system-ui, sans-serif"
    fontSize: '1.875rem'
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "'Archivo Variable', 'Inter Variable', system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 800
    lineHeight: 1.56
    letterSpacing: '-0.025em'
  title:
    fontFamily: "'Archivo Variable', 'Inter Variable', system-ui, sans-serif"
    fontSize: '1.25rem'
    fontWeight: 900
    lineHeight: 1.4
    letterSpacing: '-0.025em'
  body:
    fontFamily: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.33
  nav-label:
    fontFamily: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '0.6875rem'
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: '3px'
  md: '6px'
  lg: '10px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    height: '48px'
    padding: '0 16px'
  button-primary-hover:
    backgroundColor: '{colors.primary-strong}'
    textColor: '#ffffff'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    height: '48px'
    padding: '0 16px'
  input:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    rounded: '0'
    height: '48px'
    padding: '20px 4px 0'
  chip:
    backgroundColor: 'transparent'
    textColor: '{colors.muted}'
    rounded: '{rounded.sm}'
    height: '48px'
    padding: '0 12px'
  chip-selected:
    backgroundColor: '{colors.text}'
    textColor: '{colors.bg}'
  nav-tab:
    backgroundColor: 'transparent'
    textColor: '{colors.muted}'
    rounded: '{rounded.sm}'
    padding: '10px 8px'
  nav-tab-active:
    textColor: '{colors.text}'
  ruled-row:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    padding: '12px 4px'
---

# Design System: GymTracker

## Overview

**Creative North Star: "El cuaderno de entrenamiento"**

Este sistema se parece al objeto que reemplaza: la libreta donde alguien anota lo que levanta, entre series, con una mano ocupada. Papel de campo off-white frío, **renglón impreso** en tinta tenue, el número puesto en el margen, tinta oscura para escribir y **un solo rojo de corrección**. Refuta de frente el arreglo por defecto de la categoría —tarjetas suaves sobre un fondo claro con un acento de color— que el contrato de dirección nombra como lo que hay que negar.

**La escena decide antes que el gusto.** Alguien entrenando en un sótano a las siete de la tarde, bajo una luz de tubo dura, con el teléfono en una mano y una barra en la otra. Esa frase fuerza el claro: un fondo oscuro con reflejos de tubo es un espejo, y el papel mate no refleja. De ahí sale también la densidad —360 px de ancho, pulgares, apuro— y el alto contraste medido: **15.99:1** en el título contra el papel y **4.83:1** en el texto apagado, los dos por encima de AA sin depender del color para nada.

**Qué es este cuaderno y qué no.** El número que se acaba de escribir es lo más grande de la pantalla, y el anterior **sigue visible, tachado, en el lugar donde estaba**: la corrección es un estado de la página, no un aviso que aparece y se va. Este mundo no tiene sombras, ni degradados, ni tarjetas dentro de tarjetas, ni contenedores redondeados, ni un segundo acento, ni emojis, ni glifos usados como iconos. Tampoco hay imágenes en la interfaz: la dirección se construyó en código, sin comps y sin generación de imágenes.

**Key Characteristics:**

- Una sola cara de despliegue (Archivo), un solo acento (el rojo) y ninguna sombra en toda la app.
- La elevación es el **renglón impreso**: filete de tinta de 2 px para abrir una sección, filete de regla de 1 px para separar filas.
- La página es cuadrada; los radios son de control y el único que se usa es `rounded-sm` (3px, 25 apariciones).
- Toda cifra que se lee como dato —o que se escribe mientras alguien mira— lleva figuras tabulares (`.tabular`).
- El navegador entra en el sistema: selección, caret, barra de scroll, outline de foco y subrayado salen de la paleta.
- 360 px es la medida de trabajo; el contenedor corta en `max-w-lg` (32rem) y el pie de página reserva 7rem (112px) para la barra fija.

## Colors

Paleta contenida: el papel manda, la tinta escribe, y un solo rojo significa **"esto fue reemplazado"** o **"esto se aprieta"**. No hay grises medios ni un segundo acento decorativo.

### Primary

- **Rojo de corrección** (`primary`, #c7342a): el acento único. Rellena el botón que avanza o confirma el entrenamiento, dibuja el filete al margen de un récord nuevo, el trazo del tachado (`decoration-primary`), la selección de texto, el caret y el outline de foco. Blanco sobre él mide **5.3:1**.
- **Rojo apretado** (`primary-strong`, #a4291f): el mismo rojo bajado hasta que el blanco pasa AA (**7.2:1**). Es el estado _hover_ del botón de acento: pasar por encima **oscurece, no aclara**, porque el tinte claro es para fondo y no lleva etiqueta blanca.
- **Rojo de error** (`danger`, #a4291f): coincide en valor con `primary-strong` por aritmética, y se mantiene como **nombre separado** porque es otro significado —una acción destructiva o un error, no un botón bajo el dedo.
- **Tinte de acento** (`primary-soft`, #e0847c): tinte **para fondo**, nunca para un relleno detrás de texto blanco. Contra el papel mide **2.4:1**: no lleva etiqueta y no puede ser el anillo de foco, que necesita 3:1 como mínimo de contraste no textual.

### Neutral

- **Papel de campo** (`bg`, #f3f2ee): el fondo de la página. También es el color del texto sobre tinta (el chip seleccionado y la selección de texto).
- **Papel en sombra** (`surface`, #e9e7e1): el fondo de _hover_ de un control reglado y de la tarjeta de sincronización. No hay más niveles tonales.
- **Tinta** (`text`, #16171b): todo el texto, los iconos, el filete de 2 px que abre una sección y el relleno del estado seleccionado.
- **Tinta apagada** (`muted`, #6b6a66): tinta aclarada hacia el papel —nunca un gris, porque un gris sobre un fondo coloreado no pertenece a nadie—. Lleva las etiquetas chicas, las frases secundarias y el valor tachado.
- **Renglón impreso** (`rule`, #d8d6cf): El filete de 1 px del que están hechas las filas regladas, los bordes de los controles, la barra de scroll y los marcadores vacíos de la tira semanal.

### Named Rules

**The One Accent Rule.** El acento aparece sólo donde algo **fue reemplazado** (el tachado, el margen de un récord) o donde algo **avanza y confirma** (el botón de acento, el paso que borra). Si el rojo dice tres cosas, no dice ninguna.

**The Ink Is A State Rule.** Un estado se escribe en **tinta**, no en rojo: la pestaña actual de la navegación, el chip de filtro seleccionado y el día entrenado de la tira semanal son tinta. Estar parado en un lugar no es una presión.

## Typography

**Display Font:** Archivo Variable (con Inter Variable, system-ui y sans-serif como respaldo).
**Body Font:** Inter Variable (con system-ui, -apple-system y Segoe UI como respaldo).
**Label/Mono Font:** ninguna tercera cara; las etiquetas chicas son la cara de la interfaz en su propio peso.

**Character:** una grotesca de imprenta (Archivo, eje de peso variable hasta 900, figuras tabulares) para lo que es un título impreso, y una grotesca neutra de interfaz (Inter) para todo lo demás. **No se intercambian**: un encabezado no se resuelve subiendo el peso de la letra de la interfaz, porque la cara instalada más parecida es una falla y no un respaldo. Las dos caras se sirven **autoalojadas** desde los archivos del proyecto (`@fontsource-variable/archivo`, `@fontsource-variable/inter`), nunca desde un host externo. El `dist` queda con 308 kB de woff2 porque los paquetes traen cyrillic, greek y vietnamese, pero eso es peso de despliegue y no de sesión: el navegador pide sólo los rangos que el texto matchea, y una sesión en español baja **48 kB de Inter + 36 kB de Archivo (84 kB)**. La nota vieja de `src/index.css` dice ~66 kB y es anterior a Archivo.

**Deuda conocida, registrada y no arreglada:** la flecha `→` de la frase de los récords (`antes 75.0 kg → 82.5 kg de 1RM`) **no está en el subset `latin` de ninguna de las dos caras** —los rangos declaran `U+2191` y `U+2193`, no `U+2192`—, así que se dibuja con la fuente del sistema, en medio de una frase. Se resuelve cambiando el signo o eligiendo otro, y no se tocó en este trabajo.

### Hierarchy

- **Display** (900, 1.875rem/30px, alto de línea 1.2, letter-spacing -0.025em): el encabezado de todas las pantallas, que en este producto es **la fecha de hoy** ("Miércoles, 14 de octubre"). Sin rótulo encima ni debajo.
- **Title** (900, 1.25rem/20px, 1.4): el título del selector de ejercicios, que es la hoja de página.
- **Headline** (800, 1.125rem/18px, 1.556): los títulos de sección ("Último entrenamiento", "Récords nuevos") y el nombre del ejercicio, que va en mayúsculas.
- **Body** (400–500, 1rem/16px, 1.5): los campos, los botones y las frases. La línea no se limita por `ch`: la limita el contenedor de 32rem.
- **Label** (400–600, 0.75rem/12px, 1.33): las micro-etiquetas de los campos ("Reps", "Mín kg"), las etiquetas de la navegación (0.6875rem/11px) y los encabezados de grupo del selector, en mayúsculas y con 0.025em de letter-spacing. El número del margen de una fila de serie (`1ª`) es la cara de despliegue a 1rem, en tinta apagada.

### Named Rules

**The Own Weight Rule.** Un título usa la **cara de despliegue en su propio peso** (800/900) y nunca la cara de la interfaz engordada. El letter-spacing más cerrado que se permite es -0.04em y acá el más cerrado es **-0.025em** (`tracking-tight`).

**The Tabular Rule.** Toda cifra que se lee como dato —fechas, duraciones, kilos, series— o que se escribe mientras alguien mira lleva **figuras tabulares** (`.tabular`), para que la columna no baile.

## Layout

Una sola columna, mobile-first, centrada y **cortada en `max-w-lg` (32rem/512px)**: el mismo ancho para el contenido, la barra de navegación y la hoja del selector. La medida de trabajo es **360 px**, y el detector recorre 320, 360, 428 y 1280 sin un solo desborde horizontal. El único breakpoint que usa el código es `sm` (**40rem/640px**), y es para una sola cosa: la hoja del selector, que en el teléfono entra por abajo a pantalla completa y desde 640px pasa a panel centrado de 32rem con filete de 2 px.

Ritmo espacial: **4 px por paso** (el `--spacing` de Tailwind, 0.25rem). El proyecto no declara tokens de espaciado propios, así que la escala es esa y no se renombra. Los valores que se repiten: **1rem (16px) de margen lateral** (`px-4`), **1.5rem (24px) arriba** (`pt-6`), **7rem (112px) de reserva abajo** (`pb-28`) para la barra fija, **1.5rem entre bloques** (`mt-6`) y **0.5rem entre controles en fila** (`gap-2`).

Densidad y controles: **48 px de alto mínimo** (`min-h-12`) para todo control táctil —por encima de los 44 px que el producto exige—, 56 px (`min-h-14`) para el único botón flotante (el de Inicio) y 48×48 px para el borrar del encabezado de un ejercicio. La fila de una serie es una grilla de cuatro columnas —`1.25rem 1fr 1fr 2.75rem` con 0.5rem de separación—: el número del margen, las repeticiones, los kilos y el borrar. **La última columna mide 44 px y no es un detalle de estilo**: el borrar de la fila hereda el ancho de su columna, y con los `2.5rem` originales medía 40 px de ancho, por debajo del piso de 44 px que el producto exige — y el detector no lo veía, porque el detector mide alturas.

Lo que no hay en el layout: grillas de más de una columna de contenido, márgenes laterales distintos por pantalla, ni un encabezado propio de cada sección compitiendo con el de la página. En las pantallas del flujo el `h1` es **la fecha**; en las de autenticación es el título de la pantalla y en las rutas que todavía no tienen función, el nombre de la sección. Cuando el encabezado es la fecha —que cambia todos los días— la pantalla se identifica con un **landmark estable** (`role="region"` + `aria-label`), porque un `h1` que depende del reloj no lo puede buscar un test ni usar alguien para orientarse.

### Named Rules

**The One Column Rule.** Una sola columna, 16 px de margen, 112 px de reserva abajo y 32rem de tope. Una pantalla nueva no inventa su ancho: hereda el del shell.

## Elevation & Depth

**No hay sombras. Ninguna.** El sistema es plano por decisión, y la profundidad la lleva **el renglón impreso**: la elevación se declara **una sola vez y es el borde** —nunca borde más sombra, nunca una tarjeta dentro de otra—. Hay tres pesos de filete, y cada uno significa una cosa:

- **Filete de tinta, 2 px** (`border-t-2` en `border-text`): abre una sección o un bloque. Es la marca más fuerte de la página, y se usa 6 veces.
- **Filete de regla, 1 px** (`border-rule` + `border-b`): separa filas, cierra bloques y dibuja el borde de un control reglado. Es el más frecuente (31 apariciones).
- **Filete de acento, 4 px al margen** (`border-l-4` en `border-primary`): sólo en el panel de récords nuevos, porque ahí lo que se muestra son valores que **fueron reemplazados** por otros mejores.

La única translucidez de la app son dos superficies fijas con `backdrop-filter`: la barra de navegación (12 px de blur sobre `bg-bg/85`) y el velo del selector (8 px sobre `bg-text/60`, tinta y no negro). El archivo lo dice y lo limita: aplicarlo a un ítem de lista o a contenido en línea es caro en Android de gama baja.

No hay **Shadow Vocabulary** que documentar, y por eso esa subsección no existe: si aparece la tentación de una sombra, la respuesta es un filete.

### Named Rules

**The One Elevation Rule.** La elevación se declara una sola vez y es el borde. Nada flota: nada de sombras, degradados ni superficies apiladas.

**The Ruled Page Rule.** Cada bloque se abre con su filete de tinta de 2 px y cada fila se cierra con el filete de regla de 1 px. La página se lee como se lee un cuaderno: de arriba hacia abajo, por renglones.

## Shapes

**La página es cuadrada.** El radio de un contenedor es 0: la hoja del selector, el bloque de autenticación y las secciones del historial tienen esquinas rectas y se separan con un filete, no con una curva. El sistema declara tres radios —**3 px** (`sm`), **6 px** (`md`) y **10 px** (`lg`)—, y **en uso hay uno solo**: `rounded-sm` con **42 apariciones**, todas en controles. `md` y `lg` existen en la escala y hoy no los usa nadie; la aparición de `rounded-none` (5 veces) son los campos, porque un campo es un renglón y no una caja. Y hay **tres** `rounded-full` en la app, y los tres son excepciones con motivo: la barrita de 2 px (`h-0.5`) de la pestaña activa del nav, que es una línea y no un control, y **el avatar del perfil, que es una foto y no un contenedor** (decisión de la persona, 2026-10-19): en el cuaderno, una foto pegada es un sello.

Los bordes son parte de la forma: 1 px de regla para filas y controles, 2 px de tinta para abrir, 4 px de acento al margen para lo reemplazado. No hay recortes (`clip-path`), ni píldoras, ni geometría decorativa, ni ilustración.

### Named Rules

**The Control Radius Rule.** Los radios son de **control**, no de contenedor. Si algo agrupa contenido, se separa con un filete y se queda cuadrado; si algo se aprieta con el dedo, lleva `rounded-sm` (3px) y ningún otro radio.

## Components

El lenguaje es de **filas regladas** y **controles reglados**: nada tiene relleno propio salvo el acento, y lo que agrupa se separa con una línea.

### Buttons

- **Shape:** radio de control (3px, `rounded-sm`), 48 px de alto mínimo (`min-h-12`) y 16 px de margen lateral (`px-4`).
- **Primary:** relleno `primary` (#c7342a) con etiqueta blanca pura (#ffffff), que mide 5.3:1. Mientras está pendiente el botón se deshabilita y anuncia `aria-busy` —**la etiqueta es el indicador, no hay spinner**, que el plan prohíbe— y el deshabilitado baja a 60% (o 50% en las pantallas).
- **Hover / Focus:** el _hover_ **oscurece** a `primary-strong` (#a4291f, 7.2:1) y la transición es de color, 150ms, con `motion-reduce:transition-none`. El foco no lo pinta ningún control: lo declara una sola vez `src/index.css`.
- **Secondary (reglado):** sin relleno, con filete de regla de 1 px (`border-rule`), `hover` sobre papel en sombra (`surface`, #e9e7e1) y **sin nada de acento**. Es el botón de "Reintentar", "Cargar más", "Cancelar", "Agregar ejercicio", "Descanso", "Listo", "Salir" y "+ serie".
- **Acción destructiva:** un botón reglado cuyas **palabras** llevan `text-danger` (no un borde rojo), y el acento aparece recién en el tap que confirma.
- **Deuda conocida, y es de inventario:** el botón reglado **está escrito a mano en varias pantallas** (`ProfilePage`, `HistoryPage`, `WorkoutPage`, `WorkoutDetailPage`, `ExercisePickerDialog`, `WorkoutExerciseCard`, `PersonalRecords` —14 apariciones de `hover:bg-surface`) mientras `Button.tsx` es dueño del de acento. Es una duplicación real y su casa es este inventario. Las clases completas, que no entran en los ocho sub-tokens del frontmatter, están en el sidecar.

### Chips

- **Style:** sin relleno, texto en tinta apagada (`muted`), filete de regla de 1 px, radio de control (3px), 48 px de alto y 12 px de margen lateral (`px-3`).
- **State:** el chip seleccionado es **tinta** (`bg-text` con texto de papel `text-bg` y borde de tinta), **no rojo**. Con seis grupos musculares, pintar el filtro activo con el acento gastaría el rojo en decir cuál filtro está puesto. El estado se anuncia además con `aria-pressed`, así que el color no es el único canal.

### Cards / Containers

- **No hay tarjetas.** Un contenedor es una **sección reglada**: cuadrada, sin relleno, sin sombra, abierta con un filete de tinta de 2 px (`border-t-2` en `border-text`) y 16 px de aire arriba (`pt-4`). Las filas de adentro se separan con un filete de regla de 1 px procesado como `border-b`. Nada está anidado dentro de nada.
- **Corner Style:** ninguna curva; el radio es de control y no de contenedor.
- **La excepción que confirma la regla es el selector de ejercicios**: una hoja con fondo de papel (`bg-bg`), filete de 2 px arriba y esquinas rectas, que entra por abajo en el teléfono y se centra en 32rem desde 640px. **Sigue siendo un diálogo**, y no por costumbre: adentro hay un campo de búsqueda y un formulario que puede quedar a medio escribir, o sea foco que proteger y un cierre deliberado.
- **Skeleton:** bloques de `rule` (#d8d6cf) con radio de control y `animate-pulse`, que se apaga con `motion-reduce`.

### Inputs / Fields

- **Style:** **el campo es un renglón, no una caja**. Fondo transparente, ningún borde salvo el filete inferior de 1 px (`border-rule`), radio 0 (`rounded-none`), 48 px de alto y 4 px de margen lateral. El `placeholder` va en tinta apagada.
- **La escritura va EN el renglón.** La caja de 48 px es el objetivo táctil y no se encoge para acomodar la línea: la línea de tipo se empuja abajo (`padding: 20px 4px 0`) y termina donde empieza el filete. Un valor flotando 24 px arriba de su propia línea es lo único que una hoja rayada nunca hace.
- **Focus:** el filete pasa al acento (`focus:border-primary`) y además corre el outline global; la declaración del anillo es una sola para toda la app.
- **Error / Disabled:** el error es **la única cosa que usa el rojo en un formulario**, y no viaja sólo por color: lleva palabras en `text-danger`, `aria-invalid`, `aria-describedby` apuntando al mensaje y `role="alert"`, porque aparece después de que la persona actuó. La etiqueta va arriba, en 0.875rem/500. El `select` vuelve a ser un renglón, igual que el resto de los campos.

### Navigation

- **Style:** barra fija abajo, ancho completo, fondo de papel al 85% con 12 px de blur y filete de regla de 1 px arriba; el contenido interno respeta la zona segura del sistema (`env(safe-area-inset-bottom)`) y se corta en `max-w-lg`.
- **Default:** cuatro pestañas (Inicio, Entrenar, Historial, Perfil) con etiqueta de 11px/500 e icono SVG de 20 px en tinta apagada.
- **Active:** la pestaña actual pasa a **tinta** y, además del color, enciende una barrita de 2 px en el borde superior de la pestaña (opacidad 0/100). La barra es la razón por la que el estado sobrevive al gris y a la ceguera al color; **el acento se queda afuera de la navegación**, porque estar parado en un lugar es un estado y no una presión.
- **Mobile treatment:** es la misma barra a cualquier ancho; en 360 px cada pestaña ocupa un cuarto del ancho y su alto —icono de 20 px, etiqueta de 11px y padding (`py-2.5`)— supera con holgura los 44 px que el producto exige de un control principal.

### Correction Mark (signature)

El momento memorable del mundo: **ver tacharse una serie**. Al corregir un valor ya anotado, el anterior **no desaparece**: queda a la vista, cruzado por un trazo de acento de 2 px (`<s>` en tinta apagada con `decoration-primary decoration-2`). Tres reglas que el código sostiene:

1. **Se toma cuando el dedo llega al campo, no en cada tecla.** Lo que se tacha es el valor que estaba de verdad en el renglón; de `100` a `102,5` el campo pasa por `1` y `10`, y marcar esos sería marcar el tipeo.
2. **Volver al valor original no tacha nada**: el tachado es el registro de una corrección, no una decoración que la fila lleva siempre.
3. **Se anuncia, no se esconde**: un `Valor anterior:` en `sr-only` acompaña al tachado, porque a quien no lo ve es justo a quien se le perdería el dato.

Vive en la fila y **no en el borrador**: es lo que pasó delante del usuario, no parte de la sesión, así que no se persiste y se pierde con un recargado. Los números de la fila son tabulares y el texto manuscrito de los kg se escribe con coma.

### New Records Margin Rule (signature)

El panel de récords nuevos —lo que el servidor encontró dentro de la misma transacción que guardó la sesión— es **un filete de acento de 4 px al margen** (`border-l-4` en `border-primary`), sin relleno ni sombra. Es el lugar donde el rojo corresponde más que en ningún otro, porque lo que muestra son **valores que fueron reemplazados** por otros mejores. Dice la frase sin inventar nada —`antes 110.0 kg → 116.7 kg de 1RM`, o `primera marca: …` cuando no había marca anterior— y entra con `pr-arrive` (320ms, `ease-out`), una animación que se **saltea entera** con `prefers-reduced-motion`. No lleva emoji de festejo: en un cuaderno impreso, un confeti es una ilustración que nadie dibujó.

### Named Rules

**The Ruled Control Rule.** Un control que no avanza ni confirma el entrenamiento es **un renglón con filete**: sin relleno, con `border-rule`, con `hover` en `surface` y sin una gota de acento. El acento se gana, no se reparte.

**The No Glyphs Rule.** Ningún icono es un carácter: todo glifo se dibuja en **SVG en línea** (20 px, `stroke` 1.75, `aria-hidden`). Un carácter se dibuja distinto en cada plataforma y no hereda el color del texto con fiabilidad — y ya quedan dos pruebas de eso en la historia del proyecto (el asa `⠿` y el emoji de festejo).

## Do's and Don'ts

### Do:

- **Do** abrir un bloque con el filete de tinta de 2 px (`border-t-2` en `border-text`) y separar filas con el filete de regla de 1 px (`border-b` en `border-rule`).
- **Do** reservar el acento (#c7342a) para el relleno de un botón que avanza o confirma, el margen de los récords nuevos, el trazo del tachado (`decoration-primary`), la selección de texto, el caret y el outline de foco.
- **Do** llevar los títulos a la cara de despliegue en su propio peso (`font-display` con `font-black` o `font-extrabold`).
- **Do** dejar el foco en la declaración única de `src/index.css` (`:focus-visible` con outline de acento de 2 px y 2 px de offset): ningún componente pinta su anillo.
- **Do** dar 48 px (`min-h-12`) a todo control que se toca con el dedo y `.tabular` a toda cifra que se alinea en columna o se escribe.
- **Do** reforzar cada estado con algo además del color: la barrita del nav, `aria-pressed` en el chip, palabras de error más `role="alert"`, y el `Valor anterior:` del tachado.
- **Do** nombrar la pantalla con un landmark estable (`role="region"` + `aria-label`) cuando el encabezado es la fecha de hoy.

### Don't:

- **Don't** pintar un `ring` propio en un control, ni usar `primary-soft` como anillo de foco (2.4:1 contra el mínimo de 3:1).
- **Don't** usar una sombra, un degradado, un `backdrop-filter` fuera de las dos superficies fijas, ni una tarjeta dentro de otra: la elevación es el borde y se declara una sola vez.
- **Don't** usar el acento para un estado —la pestaña actual, el chip seleccionado, el día entrenado— ni para un enlace que sólo navega: un enlace que navega es tinta con el subrayado de la tinta apagada (`.link-ruled`), nunca con el acento. El subrayado mide **4.83:1** sobre el papel —el filete claro mide 1.30:1, y WCAG 1.4.11 pide 3:1 de un gráfico que significa algo— y está declarado **una sola vez** en `src/index.css`, porque un color copiado diez veces son diez chances de que una sola copia sea la correcta.
- **Don't** poner un radio de contenedor: nada de curvas en bloques, hojas o secciones, y ningún radio fuera de `rounded-sm` (3px) en un control.
- **Don't** poner texto blanco sobre `primary-soft` (2.4:1) ni aclarar el botón de acento con el _hover_: pasar por encima oscurece.
- **Don't** usar un carácter o un emoji como icono, y no volver a introducir el asa braille ni el festejo.
- **Don't** cerrar el `letter-spacing` más allá de -0.04em, ni subir el peso de la cara de la interfaz para resolver un título.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Personas que entrenan con pesas y registran lo que hacen, en el gimnasio y en el momento.** El
usuario principal está parado frente a una máquina, con una mano ocupada y la otra sosteniendo el
teléfono, entre series. Tiene apuro, poca luz y a menudo mala señal: el gimnasio suele ser un
sótano. Su trabajo es **anotar una serie en menos de diez segundos y volver a levantar**, y al
terminar la sesión saber qué mejoró sin tener que interpretar nada.

## Product Purpose

GymTracker registra entrenamientos de pesas —ejercicios, series, repeticiones y kilos—, **detecta
récords personales automáticamente** (1RM estimado con la fórmula de Epley) y muestra el progreso por
ejercicio. Existe porque anotar en el momento es la diferencia entre un historial útil y ninguno: las
apps que exigen armar un plan antes de entrenar se abandonan en la segunda semana.

El éxito es una sesión entera registrada **sin conexión**, sincronizada sola cuando vuelve la red, y
un récord que aparece en pantalla cuando se rompe sin que nadie lo haya calculado a mano.

## Positioning

**Funciona sin señal, de verdad.** No es una app que muestra un error cuando el gimnasio no tiene
datos: la sesión se escribe en el dispositivo, sobrevive a que se cierre el navegador, y llega al
servidor cuando puede. Un competidor que asuma conexión no puede copiar eso agregando una pantalla:
el mecanismo atraviesa el modelo de datos, la cola de escrituras persistida y el cálculo de récords,
que ocurre en el servidor **dentro de la misma transacción** que guarda los datos.

## Operating Context

- **El gimnasio, en el momento**: entre series, con el teléfono en una mano, a 360 px de ancho.
- **Sin señal**, o con una que va y viene. Es el caso normal, no la excepción.
- **El teléfono se bloquea y se desbloquea** durante la sesión, y la pantalla no puede dormirse sola
  mientras se entrena.
- **La sesión se interrumpe**: alguien cierra la pestaña, la app pasa a segundo plano, se acaba la
  batería. Lo anotado tiene que seguir ahí.
- **Idioma: español.** La interfaz y sus errores se leen en español y se entienden sin saber qué es
  un 1RM estimado.

## Capabilities and Constraints

- Registro de entrenamientos: ejercicios × series × repeticiones × kilos, sobre un catálogo de 57
  ejercicios globales más los propios del usuario. La tarjeta de cada ejercicio pide **las series**:
  la cantidad de repeticiones y los kilos levantados, serie por serie. No hay objetivo por
  ejercicio (decisión del 2026-10-20): el rango mínimo–máximo se retiró de la interfaz, y las
  columnas quedan en la base sólo para las sesiones que se guardaron mientras todavía se pedía.
- Detección automática de récords personales por 1RM estimado, en el servidor, y celebrados en
  pantalla.
- Progreso por ejercicio: peso máximo, volumen y 1RM por sesión, en una gráfica.
- Historial paginado, detalle de cada entrenamiento y borrado suave (nada se borra de verdad).
- Autenticación con Supabase; cada usuario ve sólo lo suyo, con RLS en todas las tablas.
- **Restricciones técnicas confirmadas**: PWA de una sola página sin SSR; presupuesto de bundle
  inicial de **180 kB gzip**, con las dependencias pesadas (SDK de Supabase, zod, uPlot, dnd-kit,
  Motion) fuera del chunk inicial; la base es Postgres sobre Supabase; las migraciones se aplican a
  un proyecto hosted y a un stack local, y la suite de integración corre contra los dos.
- **Decisiones de producto sin cerrar**, declaradas: el toggle kg/lb existe en los datos pero no en
  la interfaz; el peso corporal y el export CSV están planificados y sin construir.

## Evidence on Hand

- La app corre completa contra un stack local de Supabase: registro, login, entrenamiento sin
  conexión, sincronización, historial, gráfica y borrado.
- **360 tests** unitarios y de integración (`npx vitest run`), **79 aserciones pgTAP** contra la base
  local y contra el proyecto hosted, y **una prueba de extremo a extremo** en Chromium que registra
  un entrenamiento **con la red cortada** y comprueba que se sincroniza al volver, verificando el
  1RM que sólo el servidor puede calcular.
- **No hay**: usuarios reales, métricas de uso, testimonios ni capturas de producción. Nada de eso
  puede inventarse en el trabajo futuro.

## Product Principles

1. **Registrar gana a planificar.** Anotar una serie tiene que costar menos que decidir no anotarla.
2. **Sin conexión es el caso normal.** Cada función se diseña primero para cuando no hay red.
3. **Lo que el usuario escribió no se pierde.** El dispositivo guarda la intención antes de que
   cualquier servidor la conozca; sincronizar es un detalle de implementación, no una tarea del
   usuario.
4. **El servidor es el que sabe.** Lo que podría calcularse distinto según el aparato —los
   récords— se calcula una vez, del lado de la base, en la misma transacción que guarda los datos.
5. **Nada se afirma sin comprobarlo.** Un número se mide con un método escrito; una regla se prueba;
   un comportamiento se verifica contra el sistema real y no contra la idea que uno tiene de él.

## Accessibility & Inclusion

- **Se usa con una mano y en movimiento**: los controles táctiles principales miden al menos 44 px
  de alto y quedan al alcance del pulgar.
- **Se lee con poca luz y con apuro**: el contraste no depende del color solo, y ninguna información
  se transmite únicamente por color.
- **Se usa sin poder mirar la pantalla con atención**: lo que ocurre solo —una escritura que falló,
  un descanso que termina, un récord nuevo— se anuncia como región viva.
- El idioma de la interfaz y de sus errores es el español.

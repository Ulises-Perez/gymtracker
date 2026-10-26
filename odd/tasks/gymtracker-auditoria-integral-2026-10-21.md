# GymTracker · Auditoría integral — seguridad, diseño y ponytail (2026-10-21)

**Alcance:** todo el repo (`src`, `supabase`, `scripts`, `.github`, `vercel.json`, `package.json`).
**Método:** lectura de código y configuración, sin modificar nada. Seguridad y ponytail son *source-only*: no se ejecutó la app, ni migraciones, ni tests, ni se tocó ningún endpoint. Diseño: lectura de `DESIGN.md`/`PRODUCT.md`, la crítica previa del 2026-10-21 (22/40), la verificación visual `L8` contra la URL pública, y una pasada determinista nueva (`scripts/ui-audit.mjs`, 36 mediciones, 0 hallazgos) sobre las rutas de acceso.

**Límites declarados:**
- No hay sandbox OS con red aislada y target read-only en esta máquina, así que no se ejecutó código del target para confirmar explotación. Los hallazgos de seguridad son **fallas de invariante establecidas por el código**; donde falta un hecho de despliegue se dice.
- Docker está caído: el shell autenticado no se volvió a medir en navegador. El diseño de las pantallas con sesión se apoya en `L8` y en el código.
- La CI del repo sigue naciendo muerta (`startup_failure`, 0 s, 0 jobs) por un problema de cuenta de GitHub, ya documentado; nada de lo que se agregue a `ci.yml` corre hasta que se arregle.

**Reporte de diseño completo:** `.commandcode/design/review-report.md` y `review-report.html`.

---

## Veredicto en una línea

La arquitectura está sana y el offline está mejor razonado que en la mayoría de los proyectos, pero hay **cuatro fallas altas de ciclo de vida entre cuentas**, un **PAT de Supabase en texto plano en el disco**, y varios **defectos de datos** (récords, racha, unidad, peso nulo). El orden importa: primero el PAT y el cambio de cuenta; después los cálculos y los topes.

---

# 1 · Seguridad

## S1 · HIGH · PAT de Supabase en texto plano dentro de `stats/audit/cred-hex.txt`

**Evidencia:** `stats/audit/cred-hex.txt` existe (206 bytes, del 21/10 11:45), con un blob de 88 hex chars y `size=44` — la forma de `sbp_` + 40 hex, o sea un PAT de administración, no la publishable key. Lo producen `stats/audit/read-cli-token.ps1` y `dump-cred.ps1`, que leen el Administrador de credenciales de Windows; `point-auth-at-production.py` lo usa contra `https://api.supabase.com/v1/projects/<ref>`.

**Por qué cruza el límite:** el token salió del almacén de credenciales (DPAPI, ligado al usuario) y quedó en una carpeta que **OneDrive sincroniza** (`README.md:24-26`). `stats/` está en `.gitignore:13`, pero el comentario de esa línea dice "Bundle analysis report": si alguien quiere commitear `stats/bundle.html` como evidencia, borra justo la línea que protege el token. Un PAT de Supabase puede correr SQL arbitrario como `postgres` por la Management API —bypassa todas las RLS— y rotar o borrar el proyecto.

**Arreglo mínimo:** rotar el PAT **ahora**; borrar `stats/audit/cred-hex.txt` y los dos scripts que lo vuelcan; agregar `stats/audit/` a `.gitignore`; pasar el token por `SUPABASE_ACCESS_TOKEN` en el momento de la llamada, sin materializarlo. **Purgado el 2026-10-22**: se eliminó `stats/audit/` completo (incluidos `cred-hex.txt`, `read-cli-token.ps1`, `dump-cred.ps1` y `seed-audit-user.mjs`, que tenía la contraseña de la cuenta de auditoría). **La rotación del PAT sigue pendiente y es de la persona**: no puedo rotar una credencial de su cuenta.

**Veredicto:** presencia, procedencia y forma confirmadas por código. Si el token sigue vivo hay que mirarlo en el dashboard **sin imprimirlo**.

## S2 · HIGH · Un usuario puede volver indeleble el ejercicio custom de otro y leer su nombre

**Evidencia:** `0003_grants.sql:32` da `INSERT/UPDATE/DELETE` sobre `personal_records` a `authenticated`; `0001_init.sql:160-163` sólo exige `user_id = auth.uid()`; `0012_workout_exercises.sql:107-110` hace lo mismo para las tarjetas; la FK `exercise_id → exercises(id)` sólo exige que la fila exista (`0011:11-14` lo dice textual). El guard de visibilidad vive **sólo** dentro de `save_workout` (`0012:398-405`). `dashboard_summary` es `SECURITY DEFINER` y hace `JOIN exercises e ON e.id = pr.exercise_id` sin predicado de visibilidad (`0015:84-95`), y devuelve `exercise_name`.

**Escenario:** A conoce el UUID del ejercicio custom de B (no se enumera desde la app; tiene que llegar por fuera). A inserta una fila propia en `personal_records` apuntando a ese UUID → `201`. B intenta borrar su ejercicio → `23503` por la FK; B no puede ver la fila de A, así que no puede liberarla. A llama `dashboard_summary` y lee el nombre del ejercicio de B. La misma escritura directa existe para `workout_exercises` y `workout_sets`.

**Arreglo mínimo:** un trigger `check_exercise_visible` en `personal_records`, `workout_exercises` y `workout_sets` que rechace `created_by IS NOT NULL AND created_by <> auth.uid()`; el mismo predicado en el `JOIN` de `dashboard_summary`; y revocar las escrituras directas que ningún cliente usa (el grep muestra que sólo `profiles` y `body_measurements` se escriben directo).

**Veredicto:** confirmado por código. La precondición (conocer el UUID ajeno) es la que lo mantiene en high y no en critical.

## S3 · HIGH · Una cola de guardado pausada se reanuda bajo la cuenta siguiente

**Evidencia:** `AuthProvider.tsx:120-128` sólo llama a `supabase.auth.signOut()`; no hay `queryClient.clear()`, ni `queryPersister.removeClient()`, ni limpieza del draft en `src/` (sólo en tests). La mutación pausada se persiste en `gymtracker.query-cache.v1` (`queryClient.ts:84-101`), se reescribe en `pagehide` (`persist-flush.ts:26-42`) y se reanuda con `resumePausedMutations` (`queryClient.ts:136-141`). `queued-mutations.ts:100-113` → `workout-api.ts:18-36` → `save_workout` con el JWT de quien esté logueado; `0012:239,267-271` sólo rechaza si el `workout.id` ya pertenece a otro, y el id de A todavía no existe.

**Escenario:** A termina un entrenamiento sin red → la mutación queda pausada y persistida. A toca Salir: la librería borra la sesión local incluso si la llamada de red falla (`GoTrueClient._signOut`). B entra más tarde y abre la app: la cola se reanuda con el token de B y **el entrenamiento de A se escribe en la cuenta de B**, con la fecha, el título, las notas y las series de A.

**Arreglo mínimo:** en `signOut`, `queryClient.clear()` + `queryPersister.removeClient()` + `useWorkoutStore.getState().discard()`; y poner el `ownerId` en las variables de la cola para que `dispatchQueuedMutation` rechace un dueño distinto.

**Veredicto:** confirmado por código y por la librería instalada.

## S4 · HIGH · El borrador del entrenamiento es global al dispositivo y nunca se limpia

**Evidencia:** `workout-store.ts:20` (`gymtracker.workout.v1`), `:476-486` (persistencia sin dueño), `:565` (rehidrata al importar). `signOut` no toca el store. `save-sync.ts:69-86` sólo descarta cuando un guardado exitoso coincide con el `workoutId` del draft actual.

**Escenario:** A deja una sesión abierta (título, notas, series) y sale. B entra, abre Entrenar y ve la sesión de A. Puede leerla, terminarla y guardarla en su cuenta, o descartarla y destruir la única copia de A.

**Arreglo mínimo:** persistir `{ ownerId, draft }`, descartar en la rehidratación si el dueño no coincide, y `discard()` en el logout.

**Veredicto:** confirmado por código.

## S5 · HIGH/MEDIUM · Tres claves de caché no llevan dueño

**Evidencia:** `useCatalog.ts:44-49` (`['last-sets', exerciseId]`), `ExerciseDetailPage.tsx:47-52` (`['progress', exerciseId]`), `useWorkoutDetail.ts:17` (`['workout', workoutId]`). El resto de las claves sí lleva `userId` y el código lo documenta como regla. El persister guarda **todas** las queries exitosas (`queryClient.ts:101`) durante 7 días.

**Escenario:** A entrena Sentadilla en la tablet de la casa; B entra, agrega la misma Sentadilla (id global) y ve "último: 5 × 100 kg" de A, con la primera serie pre-cargada; el gráfico de progreso muestra las fechas y los máximos de A. Sin red, la entrada de A se queda en pantalla indefinidamente.

**Arreglo mínimo:** `['last-sets', userId, exerciseId]`, `['progress', userId, exerciseId]`, `['workout', userId, workoutId]`; pasar el `userId` por las firmas. El prefijo de invalidación sigue funcionando.

**Veredicto:** confirmado por código.

## S6 · MEDIUM · Fijación de sesión por el flujo implícito

**Evidencia:** `supabase.ts:43-53` usa `detectSessionInUrl: true` sin `flowType`; el default de `@supabase/auth-js` es `implicit` (`GoTrueClient.js:24`). `_isImplicitGrantCallback` acepta un `#access_token=…&refresh_token=…` (`:3355`), lo valida contra el usuario y lo persiste (`:3254-3339`).

**Escenario:** el atacante manda al víctima un link con **su propio** par de tokens. La app lo adopta como sesión; lo que el víctima registre se escribe en la cuenta del atacante.

**Arreglo mínimo:** `auth: { flowType: 'pkce', detectSessionInUrl: true }`. Costo: los links de recuperación tienen que abrirse en el mismo navegador que los pidió.

**Veredicto:** confirmado por configuración + librería; el proyecto hosted tiene que seguir permitiendo refresh implícito (dato de dashboard).

## S7 · HIGH (proceso) · La suite RLS/pgTAP no está en la CI

**Evidencia:** `.github/workflows/ci.yml` corre lint, typecheck, vitest y build; el job `e2e` levanta Supabase (`:78`) y corre Playwright (`:84`), pero **nunca** `supabase test db`. `vite.config.ts` sólo incluye `src/**` y `scripts/**`. `README.md:79` documenta la suite como paso manual contra producción (`--linked`). La suite tiene 110 aserciones que prueban que A no lee B y que `anon` no lee nada; `0010` existe justamente porque esa suite no se había corrido contra el stack local.

**Arreglo mínimo:** una línea después de `supabase start`: `- run: supabase test db`, y hacerla requerida.

**Veredicto:** confirmado por código. Ojo: la CI no arranca por la cuenta; esto no cambia hasta que se arregle.

## S8 · MEDIUM · `supabase/config.toml` es una carga de envenenamiento de auth para producción

**Evidencia:** el archivo versionado tiene `enable_confirmations = false` (`:231`), `site_url = http://127.0.0.1:3000` (`:160`), `additional_redirect_urls = ["https://127.0.0.1:3000"]` (`:164`), `minimum_password_length = 6` (`:183`), `password_requirements = ""` (`:186`). `README.md` documenta `supabase config push`. `odd/tasks/gymtracker-mvp.md` registra que producción ya estuvo exactamente así y se reparó a mano por Management API.

**Escenario:** alguien sigue el README para "arreglar el site_url" y corre `config push`: producción empieza a mandar confirmaciones y recuperaciones a `127.0.0.1:3000` y acepta altas sin verificar email, con contraseña de 6 caracteres.

**Arreglo mínimo:** hacer que el archivo versionado sea el seguro (confirmaciones `true`, origen de producción, mínimo 8) y dejar los valores locales permisivos sólo por overrides de entorno; o un wrapper que rechace `config push`.

**Veredicto:** la postura del archivo y el camino documentado están confirmados; el estado actual del hosted necesita dashboard.

## S9 · MEDIUM · La CSP permite exfiltrar a cualquier proyecto de Supabase

**Evidencia:** `vercel.json:39` — `connect-src 'self' https://*.supabase.co wss://*.supabase.co` y `img-src ... https://*.supabase.co`. La sesión vive en `localStorage` (`supabase.ts:44-51`). `*.supabase.co` es multi-tenant: cualquiera puede crear un proyecto y recibir un host ahí. Un `fetch` simple a un host atacante no necesita preflight.

**Escenario:** una dependencia comprometida (692 paquetes) corre con los privilegios del origen y manda el refresh token a `https://attacker.supabase.co/x`; la CSP lo permite.

**Arreglo mínimo:** reemplazar los comodines por el origen exacto del proyecto (`https://wcurruszasxgxzimlbdk.supabase.co`), y el `wss://` sólo si se usa realtime (no se usa).

**Veredicto:** confirmado por código.

## S10 · MEDIUM · Un `PATCH` a la tarjeta puede desincronizar sus series

**Evidencia:** `0012:107-110` permite actualizar cualquier columna de la tarjeta propia; el trigger `check_workout_set_card` sólo se dispara en `workout_sets` (`0012:222-224`), no cuando cambia la tarjeta padre. Cambiar `exercise_id` en la tarjeta deja las series con el `exercise_id` viejo: el gráfico (por serie) y el detalle/CSV (por tarjeta) dicen cosas distintas. Variante: apuntar la tarjeta al custom de B vuelve a habilitar S2.

**Arreglo mínimo:** revocar `INSERT/UPDATE/DELETE` directo sobre `workout_exercises` (ningún cliente lo escribe) o agregar un trigger `BEFORE UPDATE OF exercise_id, workout_id` que valide las series existentes.

**Veredicto:** confirmado por código.

## S11 · LOW · Inyección de fórmulas en el CSV

**Evidencia:** `src/lib/csv.ts:77-85` cotiza por `;`, `"`, `\n`, `\r`, pero no neutraliza un primer carácter `=`, `+`, `-` o `@`. El título, las notas y el nombre del ejercicio salen verbatim. Es auto-impacto normalmente; se vuelve cruzado por S2/S3. **Arreglo:** prefijar `'` antes de cotizar y testear.

## S12 · LOW · Acciones de CI por tag mutable y CLI `latest`

**Evidencia:** `ci.yml` usa `actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`, `supabase/setup-cli@v1` con `version: latest`. **Arreglo:** pinchar SHAs y una versión de CLI que traiga Postgres 17.

## S13 · LOW / needs validation · El path de avatar acepta `..`

**Evidencia:** el guard del cliente (`avatar-api.ts:139`) y la policy (`0001:229-238`) sólo comparan el primer segmento; `'<A>/../<B>/x.png'` pasa ambos. Si el storage-api normaliza `..`, A puede borrar el avatar de B conociendo el nombre. **Arreglo:** rechazar segmentos `.` y `..` en la policy y en el cliente. **Falta:** el comportamiento del storage-api (fuera del repo).

### Lo que se revisó y no es hallazgo

No hay `.env` versionado ni en el historial; no hay `eval`, `innerHTML` ni `new Function` en `src` (Zod corre jitless); `script-src 'self'`; el redirect de `location.state.from` lo cierra React Router 8; el reset usa un `redirectTo` constante; el service worker nunca cachea `/auth/`, `/rest/`, `/storage/` ni escrituras; el bucket de avatares tiene tope y MIME desde `0013`; el lockfile tiene integridad y un solo install script (`fsevents`); no hay `pull_request_target` ni inyección de `github.event.*`; no hay sourcemaps; `anon` está revocado en tablas y funciones.

---

# 2 · Diseño

**Puntaje: 37/50 · Necesita cambios.** Los cinco hallazgos prioritarios de la crítica anterior (22/40) están cerrados y verificados en `L8` con píxeles: badge visible y apoyado en la nav, confirmación de guardado, selector a pantalla completa, link a 4.83:1 y valor sobre el renglón con los rótulos una vez por tarjeta.

**Lo que queda (detalle en el reporte):**

| # | Sev | Hallazgo | Ubicación |
|---|-----|----------|-----------|
| D1 | MEDIUM | La tira semanal anuncia sólo "entrenado"/"sin entrenar", nunca el día | `DashboardPage.tsx:189` |
| D2 | MEDIUM | `Descanso` arranca pero no se detiene; no dice que son 120 s | `WorkoutPage.tsx:427` · `useRestTimer.ts:25` |
| D3 | MEDIUM | `Finalizar` habilitado con cero ejercicios; no hay "Descartar" | `WorkoutPage.tsx:454` |
| D4 | MEDIUM | El badge tapa 19.5 px del FAB de Inicio | `DashboardPage.tsx:155` |
| D5 | MEDIUM | El anillo de foco rojo se lee como error | `index.css:153` |
| D6 | MEDIUM | `72,5` en el set y `72.5 kg` en la lectura | `units.ts:35` |
| D7 | MEDIUM | El Historial no dice qué ejercicios tuvo la sesión | `HistoryPage.tsx:57-66` |
| D8 | LOW | La leyenda de uPlot del peso corporal queda en inglés | `BodyWeightChart.tsx:59-80` |
| D9 | LOW | Los gráficos no se redimensionan | `ProgressChart.tsx:65` · `BodyWeightChart.tsx:62` |
| D10 | LOW | La confirmación de guardado desaparece al recargar | `WorkoutPage.tsx:129-145` |
| D11 | LOW | "1RM estimado" sin definición | `ExerciseDetailPage.tsx:30` |
| D12 | LOW | `← Historial` usa un glifo como icono | `WorkoutDetailPage.tsx:116` |

**Verificación:** 36 mediciones deterministas en las rutas de acceso (320/360/428/1280), 0 hallazgos: sin desborde, título 15.99:1, apagado 4.83:1, botones 5.31:1, campos de 48 px, etiquetas cableadas, Archivo e Inter renderizadas. **Brecha:** el shell autenticado no se volvió a medir (Docker caído, sin cuenta); se usa `L8` y el código. El service worker sirve la build vieja en modo prompt: cualquier verificación futura tiene que aceptar "Actualizar" antes de medir.

**Decisión pendiente:** ¿el foco va en tinta (recomendado) o se queda en rojo? ¿La sesión vacía se bloquea o se permite con un "Descartar" explícito?

---

# 3 · Ponytail (bugs, datos, lean)

## Must fix

**P1 · Los récords se cuentan mal en el caso más común.** `0012:450-475`: `v_estimated_1rm` no se redondea y se compara contra una columna `DECIMAL(6,2)`. `70 × (1 + 10/30) = 93.333…` se guarda como `93.33`; la serie siguiente vuelve a dar `93.333… > 93.33` y vuelve a ser "récord". **3×10 a 70 kg devuelve tres récords**, cada uno "antes 93.3 → 93.3". El test existente usa `100 × 5 = 116.6667`, que redondea hacia arriba y por eso no lo ve. **Fix:** `round(v_weight * (1 + v_reps::DECIMAL / 30), 2)`.

**P2 · El "antes" de un récord es la serie anterior, no el récord anterior.** `0012:456-475`: `v_current_best` se relee en cada iteración; con 60/70/80/90 kg el panel muestra una escalera de "antes" que nunca existieron como récords, y dice "3 récords nuevos" mientras `personal_records` tiene uno. **Fix:** leer el best una vez por ejercicio antes del loop y usar ése como `old_1rm`; contar ejercicios distintos.

**P3 · La tira semanal usa el lunes local y el filtro UTC.** `0015:40,68` usa `CURRENT_DATE` (reloj del servidor, UTC); `DashboardPage.tsx:204-215` arma el lunes local. En Buenos Aires, domingo 21:30 ya es lunes en UTC: la semana del servidor empieza el 19 y la del cliente el 12; el entrenamiento del domingo queda afuera y los siete cuadros dicen "sin entrenar". **Fix:** `dashboard_summary(p_today DATE DEFAULT CURRENT_DATE)` y mandar `localIsoDate()` desde el cliente.

**P4 · Un peso que la columna no puede guardar congela la sesión para siempre.** `utils.ts:149-152` acepta cualquier `>= 0`, pero `workout_sets.weight_kg` es `DECIMAL(6,2)` (máximo 9999.99) y `personal_records.best_1rm` también. Un `12345` (separador olvidado) entra al draft; el RPC falla con overflow en cada reintento; `finish()` ya congeló el draft y un draft congelado no se edita. **Fix:** tope de peso y de reps en la regla compartida, y revisar la precisión de `best_1rm` para que el 1RM de un peso válido no desborde.

**P5 · Se puede finalizar una sesión vacía.** `WorkoutPage.tsx:454`: `Finalizar` es el botón más fuerte de la pantalla vacía, y `save_workout` inserta un workout sin tarjetas. El Inicio cuenta días por la fila del workout, así que la racha sube y el cuadro se pinta; el Historial lista una sesión de 0 min. **Fix:** deshabilitar hasta una serie con número y agregar "Descartar".

**P6 · Si falla la lectura del perfil, la app escribe en kilos.** `ProfilePage.tsx:117` hace `unit = profile.data?.weightUnit ?? 'kg'`; el formulario y los chips siguen habilitados aunque `profile.isError`. Alguien que lee en libras y abre con la caché fría sin red ve "kg" seleccionado y sus 150 lb se guardan como 150 kg. **Fix:** mostrar el error y deshabilitar chips/formulario mientras `isPending || isError`.

**P7 · Un peso nulo se informa como 0 kg.** `progress-api.ts:53-55` convierte `max_weight`, `total_volume` y `best_set_1rm` nulos a `0`; `ExerciseDetailPage.tsx:127` imprime "0.0 kg máx · 0.0 kg de volumen" y el gráfico plotea un punto en cero. Las dominadas sin peso no son 0 kg. **Fix:** conservar `null`, imprimir "—" y dejar que uPlot haga un hueco.

## Should fix

**P8 · Un guardado concurrente puede bajar el récord.** `0012:452-466` hace `ON CONFLICT DO UPDATE SET best_1rm = EXCLUDED.best_1rm` sin condición. Dos sesiones que se intercalan (teléfono y laptop) pueden dejar 105 como best después de 116.67. **Fix:** `WHERE excluded.best_1rm > public.personal_records.best_1rm` en el `DO UPDATE`.

**P9 · La racha y `week_days` no tienen ni un test.** `0007_dashboard_summary_test.sql` cubre `last_workout` y `total_workouts`; borrar el fallback de "ayer" o romper `week_days` deja la suite en verde. **Fix:** un caso pgTAP con tres días consecutivos y un hueco que valide ambos.

**P10 · El catálogo nunca expira.** `useCatalog.ts:30` usa `staleTime: Infinity` y confía en el `maxAge` del persister; `persistQueryClientSave` reescribe `timestamp: Date.now()` en cada guardado y `flushQueryCache` también, así que el sobre nunca llega a tener 7 días. Un ejercicio agregado al seed o creado en otro dispositivo no aparece nunca en una instalación existente. **Fix:** `staleTime` real (24 h alcanza).

**P11 · "Reintentar" puede encolar el mismo entrenamiento varias veces.** `WorkoutPage.tsx:322-328` no deshabilita el botón mientras `save.status === 'pending'`; tres toques crean tres mutaciones pausadas y el badge dice "3 entrenamientos pendientes" por uno. **Fix:** `disabled={save.status === 'pending'}`.

**P12 · Los gráficos no se redimensionan.** Ambos miden `clientWidth` al montar y no tienen `ResizeObserver`; uPlot 1.6.32 no lo trae. Al rotar o achicar, el canvas desborda o queda corto, y el comentario dice que hay un observer que no existe. **Fix:** `ResizeObserver` + `plot.setSize`, con `disconnect()`.

**P13 · El badge tapa el FAB de Inicio.** Ver D4. **Fix:** `bottom-28` (112 px).

**P14 · `fetchWorkoutDetail` hace tres viajes en serie.** `history-api.ts:123-170` espera workout, después sets, después tarjetas; sets y tarjetas son independientes. **Fix:** `Promise.all` de las tres lecturas.

**P15 · La suite E2E no está en ningún proyecto de TypeScript.** `tsconfig.node.json` incluye sólo `vite.config.ts` y `vitest.setup.ts`; `e2e/` y `playwright.config.ts` no se typechequean. **Fix:** agregarlos al `include`.

**P16 · Perfil dice "todavía no registraste tu peso" mientras carga.** `ProfilePage.tsx:425-435` elige el estado vacío cuando `weightPoints.length === 0`, y mientras `bodyWeights.isPending` eso es falso. **Fix:** skeleton mientras `isPending`.

## Nice to have

**P17 · El log de errores no tiene lector.** `logging.ts` guarda 50 entradas en memoria y `readErrorLog`/`clearErrorLog` sólo se usan en su test. Son ~180 líneas + 240 de test para cero diagnóstico. **Fix:** borrarlo o exponerlo en una pantalla.

**P18 · Columnas que nadie escribe.** `workout_sets.deleted_at`, `exercises.deleted_at` y `body_measurements.deleted_at` se filtran en cinco queries, pero el único `deleted_at` que se escribe es el de `workouts`. `exercises.slug` y `description` no se leen. **Fix:** dropear las columnas y el índice de `0006` que quedó sin sujeto.

**P19 · Los dos gráficos son el mismo componente dos veces.** Opciones de uPlot, formateador UTC, `chartLines()`, `axisSpan` y las dos constantes están copiados en `ProgressChart.tsx` y `BodyWeightChart.tsx`. **Fix:** un `uplot-options.ts` compartido; los chunks lazy siguen separados.

**P20 · El subset vietnamita de Archivo sigue en el precache.** `vite.config.ts:28-35` ignora `inter-*` pero no `archivo-vietnamese*`; son 12.9 KiB de primera instalación para un idioma que la app no habla. **Fix:** agregar `'**/archivo-vietnamese*'`.

**P21 · Un comentario dice lo contrario de lo que hace el código.** `workout-store.ts:536-557` dice que `hydrated` queda `false` ante un error de rehidratación; el callback siempre lo pone en `true`. **Fix:** corregir el bloque.

**P22 · Exports/campos que nadie lee.** `toWorkoutSummary` exportado sólo para su archivo; `SW_ROUTES[].name` nunca se lee. **Fix:** quitar el `export` y el campo.

---

# 4 · Orden recomendado

1. **S1** — rotar el PAT y purgar `stats/audit/` (credencial en OneDrive).
2. **S3/S4/S5** — teardown de logout + dueño en la cola y en el draft + dueño en las tres claves. Juntos cierran el cambio de cuenta.
3. **S2/S10** — guard de visibilidad en las tablas y en `dashboard_summary`; revocar escrituras directas innecesarias.
4. **S6** — `flowType: 'pkce'`.
5. **P1/P2/P8/P9** — redondeo del 1RM, `old_1rm` real, guard monotónico y tests de racha.
6. **P3** — fecha local en `dashboard_summary`.
7. **P4** — topes de peso/reps.
8. **P6/P7** — unidad del perfil y peso nulo.
9. **P5/D3** — sesión vacía.
10. **D1/D2/D4/D5/D6** — tira semanal, descanso, FAB/badge, foco y coma decimal.
11. **S7/S8/S9/S12** — pgTAP en CI, `config.toml` seguro, CSP exacta y acciones pinneadas.

---

# 5 · Decisiones que quedaron resueltas

En la remediación del 2026-10-22 se siguió la recomendación de la auditoría, y el usuario autorizó "con todo":

1. **PAT:** artefactos purgados. **La rotación sigue pendiente y es de la persona.**
2. **Foco:** en tinta, no en el acento. `index.css`, `Input`, la fila de la serie, `DESIGN.md` y `design.json` actualizados.
3. **Sesión vacía:** `Finalizar` deshabilitado sin una serie con reps o kg, y `Descartar` con confirmación cuando hay algo que perder.
4. **PKCE:** adoptado. Los links de recuperación tienen que abrirse en el mismo navegador que los pidió.

---

# 6 · Evidencia y brechas

**Corrido:** `scripts/ui-audit.mjs` (36 mediciones, 0 hallazgos en las rutas de acceso); lectura completa de migraciones, `src/lib`, `src/stores`, `src/hooks`, `src/pages`, `src/components`, `src/sw.ts`, `scripts/sw-rules.mjs`, `vercel.json`, `ci.yml`, `package.json`, `config.toml`; verificación de la librería instalada (`auth-js` `flowType`, `_signOut`, `_getSessionFromURL`); `git ls-files`, historial de secretos, lockfile.

**No ejecutado:** la app con sesión, migraciones, pgTAP, vitest, E2E, `npm audit`. No se tocó ningún endpoint.

**Necesita validación fuera del código:** el rol owner de `dashboard_summary` en el hosted (debería ser `postgres`, que es el que crean las migraciones); si el storage-api normaliza `..`; la configuración actual de auth del hosted (confirmaciones, site_url, mínimo de contraseña); si el PAT de `stats/audit` sigue vivo. Nada de eso se probó.

---

# 7 · Remediación aplicada (2026-10-22)

## Credencial

- Se eliminó `stats/audit/` completo: `cred-hex.txt`, `read-cli-token.ps1`, `dump-cred.ps1`, `seed-audit-user.mjs` (con la contraseña de la cuenta de auditoría) y los scripts que usaban el PAT.
- `.gitignore` ahora dice qué es `stats/` y por qué no se commitea.
- **Pendiente de la persona: rotar el PAT en el dashboard de Supabase.**

## Ciclo de cuenta (S3/S4/S5)

- `src/lib/session-cleanup.ts`: `queryClient.clear()` + `queryPersister.removeClient()` + `discard()` + borrado directo de `WORKOUT_STORAGE_KEY` (por si la reescritura del persist falla o pierde la carrera).
- `AuthProvider`: en `SIGNED_OUT` limpia todo. La librería borra la sesión local incluso cuando la red falla, así que ese evento es el momento correcto.
- `ownerId` en la cola (`saveWorkoutVariablesSchema`, `saveWorkout`): una entrada de A se rechaza antes de la red si la sesión es de B.
- Claves con dueño: `['last-sets', userId, exerciseId]`, `['progress', userId, exerciseId]`, `['workout', userId, workoutId]`.
- Tests: `session-cleanup.test.ts`, `AuthProvider.test` (SIGNED_OUT), `useCatalog.test` (una entrada por usuario).
- **No se agregó `ownerId` al draft**: el `discard()` del logout es el control; el draft no sobrevive a un cambio de cuenta. Queda como defensa en profundidad pendiente.

## Auth, RLS y deploy

- `flowType: 'pkce'` en `src/lib/supabase.ts`.
- `0016_dashboard_visibility_and_local_date.sql`: trigger `check_exercise_visible` (SECURITY DEFINER, search_path fijo) en `personal_records`, `workout_exercises` y `workout_sets`; `dashboard_summary(p_today)` con día local y predicado de visibilidad en `recent_prs`; drop de la firma vieja y grants nuevos.
- `0017_save_workout_records.sql`: `round(...,2)` antes de comparar y guardar; `achieved_at` con la fecha del payload; `ON CONFLICT DO UPDATE ... WHERE` monotónico + `ROW_COUNT`; `best_1rm` a `DECIMAL(10,2)`.
- `0018_avatar_path_segments.sql`: la policy de `storage.objects` rechaza segmentos `.` y `..`.
- `supabase/tests/0008_audit_fixes_test.sql`: 8 aserciones (redondeo, fecha, dos guards de visibilidad, día local, racha).
- CI: `supabase test db` después de `supabase start`; CLI pinneado a 2.120.0.
- CSP: origen exacto del proyecto, sin `*.supabase.co` ni `wss://`.
- `config.toml`: mínimo de contraseña 8 y aviso de no `config push`. **Los valores locales permisivos siguen** (el E2E los necesita) y el `push` no se hizo. **Riesgo residual:** el aviso no es un control técnico; alguien que lo ignore puede aplicar el archivo al hosted. Las acciones de CI siguen por tag mutable (sin red no se pudieron resolver los SHAs).

## Datos

- Topes de peso (0–9999,99) y reps (1–1000) en `workoutNumberRules`, con tests.
- `dashboard_summary` recibe el día local; `useDashboard` lo pasa y lo incluye en la key.
- Perfil: si falla la lectura, no escribe unidad ni peso y muestra una alerta.
- `progress-api`: un peso nulo se conserva; la fila imprime "—" y el gráfico deja un hueco.
- `fetchWorkoutDetail`: las tres lecturas corren en paralelo.
- Catálogo: `staleTime` de 24 h, no `Infinity`.
- `Reintentar` deshabilitado mientras hay una escritura pendiente.
- `e2e/` y `playwright.config.ts` incluidos en `tsconfig.node.json`, así que `npm run typecheck` los cubre.
- Perfil: skeleton mientras el peso corporal carga.
- Subset vietnamita de Archivo fuera del precache (47 entradas, antes 48).

## Diseño

- Tira semanal con el día en el `aria-label`.
- Descanso con la duración visible ("Descanso · 2:00") y un stop real.
- `Finalizar` deshabilitado sin una serie con reps o kg; `Descartar` con confirmación cuando hay datos.
- FAB a `bottom-28` para no quedar debajo del badge.
- Foco en tinta en `index.css`, `Input`, la fila de la serie, `DESIGN.md` y `design.json`.
- Coma decimal en `formatWeight`, `PersonalRecords` y los ejes de ambos gráficos.
- Leyenda de uPlot oculta en el peso corporal.
- `ResizeObserver` en los dos gráficos.
- Ayuda de 1RM en la pantalla de progreso.
- Flecha SVG en las dos pantallas que tenían `←`.

## Verificación

- `npm test`: **613/613 en 63 archivos**.
- `npm run typecheck`: verde, incluido el E2E.
- `npm run lint`: verde.
- `npm run build`: verde; precache 47 entradas (el subset vietnamita de Archivo salió).
- **No corrido:** pgTAP (Docker caído), E2E (Docker caído), `npm audit` (sin red), medición visual del shell autenticado. La CI sigue sin arrancar por la cuenta de GitHub; el `supabase test db` nuevo no corre hasta que se arregle.
- **No verificado:** el rol owner de `dashboard_summary` en el hosted, el comportamiento del storage-api con `..`, la configuración actual del hosted, la rotación del PAT.

## Lo que queda abierto (honesto)

- **Rotar el PAT** (persona).
- `config.toml` sigue con valores locales; el aviso no es un control técnico.
- Acciones de CI por tag mutable.
- `ownerId` del draft (defensa en profundidad; el logout ya lo limpia).
- `old_1rm` sigue siendo el récord que cada serie reemplazó en ese momento; la confirmación cuenta ejercicios distintos. La escalera del panel es deliberada.
- **D10**: la confirmación de guardado sigue construida desde `useMutationState`, así que no sobrevive a un recargado. Es el único hallazgo de diseño que quedó sin implementar.
- `logging.ts` sin lector, columnas `deleted_at` sin uso y gráficos duplicados: nice-to-have no ejecutados.
- Verificación visual del shell con sesión y E2E real, pendientes por Docker/cuenta.

---
target: "https://gymtracker-devkiings-projects.vercel.app"
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "url:https://gymtracker-devkiings-projects.vercel.app/"
timestamp: 2026-10-21T15-32-08Z
slug: gymtracker-devkiings-projects-vercel-app
---
# GymTracker design critique

**Method: dual-agent (A: jd-judge-a · B: jd-judge-b)**

Target: the deployed app at https://gymtracker-devkiings-projects.vercel.app, reviewed as a whole product surface (Login, Inicio, Entrenar, Historial, detail, progress chart, Perfil). Assessment A read the contract (PRODUCT.md, DESIGN.md, the surface brief) and the source, then drove the live app in ego lite at 360×740 (also 320×700, 428×740, 1280×800) and judged the pixels. Assessment B ran the bundled detector over the whole `src` tree and drove the same app for browser evidence, isolated from A.

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The sync badge is rendered at y 694→732 while the fixed nav covers y 678.5→740 — 100% behind the nav, invisible on 3 of 4 screens. |
| 2 | Match System / Real World | 3 | Excellent in the row; off-world vocabulary survives ("1RM estimado", "reps" inside a Spanish sentence, "Descanso" with no duration). |
| 3 | User Control and Freedom | 2 | The picker's only labelled dismiss, "Cancelar", sits at y 676→724, fully under the nav; the rest timer can be started but never stopped. |
| 4 | Consistency and Standards | 2 | Decimal separators mix inside one screen (`67,5` struck vs `67.5 kg` on the same card); the body-weight chart keeps uPlot's English legend ("Time: -- ☐ kg: --"); load-error states differ screen to screen. |
| 5 | Error Prevention | 2 | The number contract is excellent, but a card with zero series is saved and rendered, and "Finalizar" is a full-width red fill on an empty session. |
| 6 | Recognition Rather Than Recall | 2 | The week strip has no day names (7 anonymous boxes, `aria-label="entrenado"`); history rows carry no exercise information; the only route to a chart is an underlined heading at 1.30:1. |
| 7 | Flexibility and Efficiency of Use | 3 | `+ serie` seeding genuinely delivers the ten-second promise; against it the picker puts 11 chips in front of the list and every set reprints `Reps`/`kg`. |
| 8 | Aesthetic and Minimalist Design | 3 | The paper discipline is consistently kept; the empty editor is ~75% void and its loudest object is `Finalizar`, not the task. |
| 9 | Error Recovery | 2 | The workout screen has the best copy in the app plus a "Reintentar"; the other three load-failure states name the cause and offer no retry control. |
| 10 | Help and Documentation | 1 | No help anywhere: 1RM, "Descanso" (120 s, never surfaced), what a workout is on the empty screen, what the offline queue does. |
| **Total** | | **22/40** | **Acceptable (55%) — significant work needed before users are happy** |

---

## Design Specificity Verdict

**LLM assessment.** The material is authored for this product; the composition is largely category-default. The notebook world lives in the right places — the 2px ink rule that opens a section, the ruled field instead of a box, tabular figures on every datum, the correction mark struck in the accent with the old value left in place, the 4px accent margin on the new-records panel, the selected chip in ink and not red, the nav's active state as ink plus a 2px bar, the browser's own surfaces themed from the palette. Refusing the category's soft-card-with-shadow-and-a-colour-accent is systematic: zero shadows and zero nested cards in every screen reviewed.

One layer up, the arrangement is the app-store default: a fixed four-tab bottom nav with icon+label, a floating `+ Nuevo workout` FAB, a dashboard shaped *date → greeting → streak → week strip → last workout → recent records*, a profile shaped *avatar → name → unit → stats grid → body weight → export → install → logout*. Those shapes could be lifted unchanged into a running log, a meditation timer or a budgeting app. The notebook shows up in the details and not in the layout — which is why the most on-brand screen is the set row and the least on-brand is the empty `Entrenar` screen, where the idea evaporates into a date and a red rectangle on a void.

There is also a tension the design documents do not resolve. `DESIGN.md` names the accent's meaning as "replaced"/"commits" and then spends it on the focus ring, the caret, the text selection and the fill. In the correction frame — the signature moment — the accent appears three times at once: the strike on `67,5`, the focus box around the new `70`, and the `Finalizar` fill three rows below. The one moment the design needs to be unambiguous is the moment it is least so.

One authored idea is half-implemented: the surface brief promises "su próxima serie como un renglón vacío con la anterior justo encima y tachada". What shipped is the opposite order and a different trigger — the previous session's number lives in a separate grey line ("último: 8 × 67.5 kg") and the strike only appears after you touch the cell.

**Deterministic scan.** The bundled detector over the whole `src` tree (155 files, exit code 2) returned **2 findings, both false positives**, and one of them exposed a documentation defect rather than a code defect:

- `design-system-font-size` — `src/components/layout/BottomNav.tsx:25` (`text-[11px]`). The code matches DESIGN.md's prose, which documents "las etiquetas de la navegación (0.6875rem/11px)"; the machine-readable ramp says `label: 0.75rem`. The ramp table and the prose disagree with each other. **The defect is in DESIGN.md's token table.**
- `side-tab` — `src/components/workout/PersonalRecords.tsx:30` (`border-l-4`). DESIGN.md declares this exact element as one of its three rule weights and it is the only occurrence in the codebase.

Mechanical checks that did find real debt: the ruled control button is hand-written **24 times across 11 files** (no shared `ruled-button` class exists; `Button.tsx` owns only the accent variant); **3 glyph icons** survive where the project's own "No Glyphs Rule" forbids them (`←` in `ExerciseDetailPage.tsx:69` and `WorkoutDetailPage.tsx:119`, `+` in `DashboardPage.tsx:159`); 11 inline text links sit under 44px; one error message (`ProfilePage.tsx:379`) has no `role="alert"` (documented as deliberate). Clean: **zero** hard-coded colours outside the palette, **zero** shadows, **zero** gradients, `backdrop-filter` only in the two sanctioned surfaces, the accent never used for a selected state, and **zero** unlabelled form controls.

**Visual overlays.** The browser detector ran on `/`, `/history`, `/profile` and `/workout` and reported **"No anti-patterns found."** on every page. Getting it to run took CDP injection plus `Page.setBypassCSP`: the deployed app's `script-src 'self'` blocks the overlay script, and the WASM rule core needs `wasm-unsafe-eval`. **No user-visible overlay was ever produced** (zero overlay DOM nodes in every mode, including a synthetic-finding control) — the only signal was the console output and `window.impeccableScan`.

---

## Overall Impression

The row is excellent and the frame around the row is not. The discipline that makes this product feel like a notebook — no shadows, no cards, one accent, ink for selection, figures that hold their column — is real and consistently kept. But the app's most important feedback (a session waiting for the server, a session saved, a session that failed) is either invisible (behind the nav), absent (silence) or conditional (only when there is a new record). The most-used screen of the product opens on a void.

**The single biggest opportunity:** make the state of the session visible. One strip above the nav that says what happened — pending, saved, failed — would close three of the findings at once, because the offline promise is the product's positioning and the interface is currently the only thing not delivering it.

---

## What's Working

1. **The correction mark, exactly as authored.** Focus the weight, change it, and the previous value is struck in place in muted ink with a 2px accent line while the new value takes the field. It survives the real device test, including the comma (`67,5`), and it is announced as "Valor anterior:" for anyone who cannot see it.
2. **`+ serie` seeding from the set above.** One tap yields a row pre-filled with the weight you are about to lift. It is the ten-second promise, kept, and invisible as a feature — which is exactly right.
3. **The paper discipline.** Zero shadows, zero nested cards, one accent, the selected chip in ink rather than red, the nav's active state carried by a 2px bar so it survives greyscale, and the browser's own surfaces themed from the palette. This is craft, not styling.

---

## Priority Issues

### 1. [P0] The sync badge is 100% behind the fixed bottom nav
**Location:** `src/components/pwa/SyncBadge.tsx:27-28`, rendered in `src/app/AppShell.tsx:28-30`.
**Impact:** "Sin conexión es el caso normal" is the product's entire positioning, yet on three of four screens there is no visible sign that a session is still on the device. The user cannot know whether to re-log it.
**Fix:** Render the badge inside the scroll area or as a fixed strip above the nav (`bottom-[68px]`, `z-40`) that pushes content instead of hiding under it. Raise its text to `text-text`: `text-muted` on `bg-surface` measures 4.38:1, below AA.
**Suggested command:** `layout`

### 2. [P0] A successful save says nothing — the end of the primary task is silent
**Location:** `src/pages/WorkoutPage.tsx:239-283`.
**Impact:** After `Finalizar` with no new record, the screen becomes the date plus `Nuevo workout` and nothing else. The one question after forty minutes in a basement — "did it save?" — is answered with silence, and the loudest object on screen is a red button that starts a *new* session.
**Fix:** A persistent confirmation in the settled state ("Guardado · 21/10 · 3 ejercicios · 1 récord nuevo") with a link into the history, that survives the records panel and does not depend on a PR existing.
**Suggested command:** `clarify`

### 3. [P1] Every navigation link is separated from body text by a 1.30:1 underline; the drag handle is invisible
**Location:** `DashboardPage.tsx:88`, `WorkoutDetailPage.tsx:117` and `:155`, `ExerciseDetailPage.tsx:67`, `LoginPage.tsx:58` and `:91`, `SortableExerciseList.tsx:155`.
**Impact:** `textDecorationColor: rgb(216,214,207)` on `rgb(243,242,238)` = **1.30:1**, against WCAG 1.4.11's 3:1 for a meaningful graphic. The stated scene is a hard tube light and a phone in one hand; links stop reading as links, and the exercise-name link — the only route into the chart — becomes unreachable by discovery. The drag handle, the only affordance for reordering a card, is a field of grey dots at the same 1.30:1 on a 32px target.
**Fix:** Introduce a stronger rule for *interactive* underlines (muted `#6b6a66` = 4.83:1, or a dedicated token ≥3:1) and keep the pale rule for non-interactive separators; lift the drag handle to at least `text-muted` and give it a visible label.
**Suggested command:** `colorize`

### 4. [P1] The picker's dismiss control and its results live under the fixed nav
**Location:** `src/components/workout/ExercisePickerDialog.tsx:207` (sheet), `:355-364` (Cancelar).
**Impact:** Measured: `Cancelar` at y 676→724 under a nav covering 678.5→740 — covered and unclickable; the result list's tail is also under the nav. Sam has no Escape key and Jordan does not know to swipe the veil, so the only labelled dismiss is invisible on the screen Casey opens every session.
**Fix:** Lift the sheet above the nav (`bottom-[68px]`) or make it full-height on mobile, add a ✕ to the header, and pad the results list so its last row clears the nav.
**Suggested command:** `layout`

### 5. [P2] The field is a line, but the writing floats 24px above it — and every set reprints its column labels
**Location:** `src/components/ui/Input.tsx:36-40`; `src/components/workout/WorkoutExerciseCard.tsx:262-292`.
**Impact:** The label's bottom is at y=156 and the rule at y=210 — a 54px gap, so the typed value sits ~24px above its own rule. On paper, the writing sits *on* the line. Separately, `Reps` and `kg` are reprinted on every set row: four sets = eight redundant labels and ~290px of scroll, which taxes the ten-second promise directly.
**Fix:** Sit the value on the rule (align the input's text to the bottom of its 48px box, drop the empty band) and print `Reps`/`kg` once per card as a column header, so a set row becomes a single ruled line: `1ª  8  70  ✕`.
**Suggested command:** `typeset`

---

## Persona Red Flags

**Casey — distracted, one-handed, 360px, bad light, one hand busy.**
- `Finalizar` is a full-width red fill on the empty editor, while the real task `Agregar ejercicio` is a ruled button of equal weight to `Descanso`. The most saturated thing on the page is the button that *ends* the session.
- The card's ink rule starts at x=68 while every other rule on the page starts at x=32: the drag-handle column breaks the page's left edge, so the eye re-anchors on every card.
- The drag handle is 6 dots at 1.30:1 on a 32px target, and it floats beside *set 2* rather than the card title.
- The set editor needs four bands and ~72px per set; with five sets the card is 360px tall and `+ serie` falls below the fold.
- The picker's first tap target sat at y=685 — behind the nav. Casey taps the nav.
- After saving, the loudest thing on screen is `Nuevo workout`.

**Sam — screen reader and keyboard only.**
- The week strip's items are labelled only `entrenado`/`sin entrenar`: the weekday is not announced either. Sam cannot learn which days they trained.
- `Cancelar` in the picker is unreachable behind the nav: Sam must tab past 57 exercise buttons and 11 chips to find it, and there is no ✕.
- `:focus-visible` draws a 2px accent rectangle around a field that has no box — in the same red as the error state. On the search field it is visually indistinguishable from an invalid input.
- The drag handle is focusable with a 1.30:1 visible mark: Sam can focus a control he cannot see.
- The struck value is announced ("Valor anterior:") but is not wired to the input it corrects with `aria-describedby`, so the announcement arrives detached from the field.
- The body-weight chart's uPlot legend injects the English word "Time" and `--` values into the accessibility tree.
- One skip link ("Saltar al contenido"); no skip link past the nav, and the nav is last in the tab order.

**Jordan — first-timer.**
- `Entrenar` with no draft: a date and a red button. Nothing says what a workout is, what the app will ask for, or that it works without signal.
- The picker leads with 11 muscle-group chips and a "Nuevo ejercicio" button; the fast path (type two letters) is not signposted.
- `Descanso` is a button that appears to do nothing for two minutes and never states its duration.
- `1RM estimado` is offered as a chart metric with no explanation — and PRODUCT.md says the user should not need to know what an estimated 1RM is.
- `antes 85.5 kg → 88.7 kg de 1RM` explains nothing: not what 1RM means, not where the number came from.
- History rows carry no exercise names, so Jordan cannot judge a session without opening each one.

---

## Minor Observations

- **Decimal separators mix inside one screen.** The struck value is `67,5` while the same card's history line reads `67.5 kg` and every read screen reads `40.0 kg`, `1300.0 kg de volumen`. Rioplatense Spanish writes `40,0`. `formatWeight` (`src/lib/units.ts:35-37`) is the single place to fix it, `formatNumber` the other.
- The body-weight chart keeps uPlot's legend — "Time: -- ☐ kg: --" — because `BodyWeightChart.tsx` lacks the `legend: { show: false }` that `ProgressChart.tsx:73` has. English, bare dashes and a checkbox in a hand-authored paper world.
- The progress chart's x-axis ticks land on arbitrary even days (12/10, 14/10, 16/10, 18/10, 20/10) that read as session dates but are not.
- The date is the `h1` on Inicio, Entrenar **and** the workout detail, so the session's own name ("Empuje") is always demoted to a muted line on the page that is about it.
- "reps" is English inside a Spanish sentence on the dashboard ("67.5 kg · 8 reps · 21/10/2026").
- `Descanso` can only start a timer; tapping it again restarts from 2:00. There is no stop.
- History rows carry no exercise count or names, while the dashboard's "Último entrenamiento" block does show "2 ejercicios" — the same fact, two screens, inconsistent.
- The new-record panel prints the old and the new 1RM with the same size and weight, both muted: nothing marks the new number as new. In a notebook, the new figure is what you circle.
- The 404 page's block is top-aligned while every other unauthenticated page is vertically centred.
- The dashboard FAB floats in a large void on desktop: it rides the 512px column but sits 80px above the nav with nothing under it.
- The uPlot chart on desktop is ~421px wide inside a 480px column, because the width is captured at mount (`ProgressChart.tsx:60`).
- The ruled control button is hand-written 24 times across 11 files — DESIGN.md already names this as known debt; it is the design-system's largest duplication.
- Three glyph icons survive where the project's own rule forbids them: `←` (`ExerciseDetailPage.tsx:69`, `WorkoutDetailPage.tsx:119`) and `+` (`DashboardPage.tsx:159`).

---

## Questions to Consider

1. **If red means only "this was replaced" or "this commits", what does a red *focus ring* mean?** The accent is spent on focus, caret and selection too, and in the correction frame it is simultaneously the strike, the focus box and the `Finalizar` fill. Does the One Accent Rule survive being a focus ring — or should focus move to ink (a 2px ink outline plus a 1px offset) so red keeps its single meaning exactly where the design says red matters most?
2. **The brief promised the previous value waiting, struck, above the empty next line. What shipped is the opposite order and a different trigger.** Which is the notebook's truth — the correction that already happened, or the correction that is about to happen? Right now the app can only draw the first one, and the second ("último: 8 × 67.5 kg") is demoted to a grey line instead of being the ghost the user is about to replace.
3. **The offline promise is delivered by the engine and abandoned by the interface.** The queue persisted, the catalogue survived, the session synced and appeared in the history — and the only design element carrying that story is a 38px grey badge behind the nav. Is the offline story being told in the right place, or is it an engineering story told in a UI slot that was never designed?

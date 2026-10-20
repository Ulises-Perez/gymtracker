/**
 * Design-review screenshots.
 *
 * Not an end-to-end test: it captures the rendered screens so the UI can be reviewed as pixels
 * instead of inferred from source. Playwright's real test suite and its config belong to the
 * end-to-end suite in `e2e/`.
 *
 *   node scripts/capture-screens.mjs            # against the dev server
 *   BASE_URL=http://localhost:4173 node scripts/capture-screens.mjs   # built artefact
 *
 * It signs in, because without a session every gated route lands on the login screen and the
 * captures come out as two distinct screens instead of the fourteen this exists to produce. And it
 * records a workout before capturing, because an empty account renders the same empty state on
 * every screen: the card with its series rows — the memorable moment of this world — cannot be
 * reviewed from a skeleton. That costs one fresh, timestamped account per viewport, and it is the
 * price of every capture having something real in it.
 *
 * Three things it has to get right, and each of them was wrong in a first version:
 *
 *   1. **The draft is captured before it is finished.** The workout screen is the only place the
 *      card being written appears, and finishing replaces it with the summary. So the order is:
 *      record, capture, *then* finish.
 *   2. **The two screens behind a click wait for the URL.** The router is client-side, so a click
 *      resolves before React has swapped the screen, and a first version read the previous screen's
 *      heading and captured a frame it could not vouch for. The route is the thing that actually
 *      changed, so the route is what gets awaited.
 *   3. **Loading is awaited through the app's own signal.** `PageSkeleton` renders
 *      `role="status" aria-busy="true"` while a screen is fetching, so what is waited for is that
 *      element leaving — not a sleep, and not a guess at how long the stack takes.
 *
 * What it still cannot do is read the pixels: this script produces the evidence, it does not judge
 * it. That needs an eye. What it does instead is leave a manifest next to the captures with the URL
 * and the heading each screen actually rendered, so "these are the real screens and not the login
 * screen" is a claim someone can check without opening all fourteen files.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT_DIR = 'stats/screens';

/** Long enough for the local stack's policy, and not a real secret. */
const PASSWORD = process.env.CAPTURE_PASSWORD ?? 'gymtracker-captura-2026';

/** Reps and kilos, in the order they are typed. The same session the end-to-end suite records. */
const SETS = [
  [10, 40],
  [5, 100],
  [5, 105],
];

const viewports = [
  { name: 'mobile', width: 360, height: 740, scale: 2 },
  { name: 'desktop', width: 1280, height: 800, scale: 1 },
];

/**
 * What each capture is, in one line each.
 *
 * Written next to the images because the pixels need an eye and the eye needs to know what it is
 * looking at: without this, "the captures came out signed in" is something only a person who opens
 * all fourteen files can say. The heading is the screen's own, so a capture that fell back to the
 * login screen would say "Entrar" here and be obvious.
 */
const manifest = [];

const browser = await chromium.launch();
await mkdir(OUT_DIR, { recursive: true });

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    locale: 'es-AR',
    /*
     * The world is a page of paper: the stylesheet declares `color-scheme: light`, and asking the
     * context for dark made the native controls, the scrollbar and the caret render for a theme this
     * app does not have. This said `dark` while the app was dark, and outlived it.
     */
    colorScheme: 'light',
  });
  const page = await context.newPage();

  // The routes are lazily loaded and the stack is real, so every wait here is generous.
  page.setDefaultTimeout(30_000);

  await register(page);
  await startWorkout(page);

  // The draft, open, with the card as the user is writing it. This is why the order matters.
  await capture(page, viewport, 'entrenar');

  await finishWorkout(page);

  await capture(page, viewport, 'inicio', { path: '/' });
  await capture(page, viewport, 'historial', { path: '/history' });
  await capture(page, viewport, 'detalle', {
    click: () => page.getByRole('link', { name: /Empuje/ }).click(),
  });
  await capture(page, viewport, 'progreso', {
    click: () => page.getByRole('link', { name: 'Press Banca', exact: true }).click(),
    // uPlot paints into a canvas, and the graph is the point of this screen.
    ready: 'canvas',
  });
  await capture(page, viewport, 'perfil', { path: '/profile' });
  await capture(page, viewport, 'no-encontrada', { path: '/ruta-inventada' });

  await context.close();
}

await browser.close();
await writeFile(
  `${OUT_DIR}/manifest.txt`,
  manifest.map((line) => `${line.file}\t${line.url}\t${line.heading}`).join('\n') + '\n',
);
console.log(`\nListo. ${manifest.length} capturas y su manifiesto en ${OUT_DIR}/`);

/** Waits for the route to change, for the app to stop loading, and for the webfont. */
async function settle(page, ready) {
  // The app's own "I am still fetching" signal, released when the screen has its data.
  await page.locator('[role="status"][aria-busy="true"]').waitFor({ state: 'detached' });

  if (ready) {
    await page.locator(ready).first().waitFor();
  }

  await page.waitForSelector('h1');
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page, viewport, name, { path, click, ready } = {}) {
  if (path) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
  }

  if (click) {
    // The router is client-side: the click returns before the screen has been swapped, so what is
    // awaited is the route itself and not the click.
    const before = page.url();

    await click();
    await page.waitForURL((url) => url.href !== before);
  }

  await settle(page, ready);

  const file = `${OUT_DIR}/${viewport.name}-${name}.png`;
  const heading = (await page.locator('h1').first().innerText()).replaceAll('\n', ' ').trim();

  /*
   * The nav is `position: fixed`, and a full-page screenshot paints a fixed element at its viewport
   * position: in a page taller than the viewport that put the nav in the middle of the shot, cutting
   * the content it should sit under, and its translucent background smeared the accent colour of the
   * button underneath across a band nobody could explain. Pinned into the flow for the shot only, it
   * lands where the DOM puts it and nothing is hidden.
   *
   * Declared because it is a capture-time change and not a property of the app: the review reads
   * these images, so what was altered to make them has to be written down.
   */
  await page.addStyleTag({
    content: 'nav[aria-label="Navegación principal"] { position: static !important; }',
  });

  await page.screenshot({ path: file, fullPage: true });
  manifest.push({ file, url: page.url(), heading });
  console.log(`capturado ${file}  ←  ${heading}`);
}

/**
 * A fresh address every run: the local stack keeps what it holds, so a fixed one would be a
 * duplicate account on the second run. Confirmation is off locally, so registering signs the user
 * in and the shell takes over.
 */
async function register(page) {
  await page.goto(`${BASE_URL}/register`);
  await page.getByLabel('Nombre').fill('Persona de captura');
  await page.getByLabel('Email').fill(`captura-${Date.now()}@example.com`);
  // Anchored: `Contraseña` is a substring of `Repetí la contraseña`.
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetí la contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await page.getByRole('navigation', { name: 'Navegación principal' }).waitFor();
}

/** Opens a workout and fills one card: a title and three recorded series. */
async function startWorkout(page) {
  await page.goto(`${BASE_URL}/workout`);
  await page.getByRole('button', { name: 'Nuevo workout' }).click();
  await page.getByLabel('Título').fill('Empuje');

  await page.getByRole('button', { name: 'Agregar ejercicio' }).click();
  // `exact` because the accessible name matches as a substring by default, and the seeded
  // catalogue also holds "Press Banca Declinado" and "Press Banca Inclinado".
  await page.getByRole('button', { name: 'Press Banca', exact: true }).click();

  // The card asks for the series and nothing else: the objective it used to open with is gone.
  for (const [index, [reps, weight]] of SETS.entries()) {
    const position = index + 1;

    await page.getByRole('button', { name: '+ serie' }).click();
    await page.getByLabel(`Reps serie ${position}`).fill(String(reps));
    await page.getByLabel(`Peso en kg serie ${position}`).fill(String(weight));
  }
}

/**
 * Ends the session, and waits for the server's answer rather than for the screen to change.
 *
 * The records only exist in the reply to `save_workout`, so seeing them means the workout was
 * written — which is what makes the captures that follow show real data and not a skeleton.
 */
async function finishWorkout(page) {
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await page.getByRole('status', { name: 'Récords nuevos' }).waitFor();
}

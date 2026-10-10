/**
 * Design-review screenshots.
 *
 * Not an end-to-end test: it captures the rendered screens so the UI can be
 * reviewed as pixels instead of inferred from source. Playwright's real test
 * suite and its config belong to Fase 3 (T3.10).
 *
 *   node scripts/capture-screens.mjs            # against the dev server
 *   BASE_URL=http://localhost:4173 node scripts/capture-screens.mjs   # built artefact
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT_DIR = 'stats/screens';

const viewports = [
  { name: 'mobile', width: 360, height: 740, scale: 2 },
  { name: 'desktop', width: 1280, height: 800, scale: 1 },
];

const routes = [
  { name: 'inicio', path: '/' },
  { name: 'entrenar', path: '/workout' },
  { name: 'historial', path: '/history' },
  { name: 'perfil', path: '/profile' },
  { name: 'no-encontrada', path: '/ruta-inventada' },
];

const browser = await chromium.launch();
await mkdir(OUT_DIR, { recursive: true });

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    locale: 'es-AR',
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'load' });
    // The routes are lazily loaded, so wait for the real screen and for the
    // webfont before capturing.
    await page.waitForSelector('h1');
    await page.evaluate(() => document.fonts.ready);

    const file = `${OUT_DIR}/${viewport.name}-${route.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`capturado ${file}`);
  }

  await context.close();
}

await browser.close();
console.log(`\nListo. ${viewports.length * routes.length} capturas en ${OUT_DIR}/`);

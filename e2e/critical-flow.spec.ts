import { expect, test } from '@playwright/test';

/**
 * The flow the whole phase exists for, in a real browser.
 *
 * Section 5 of the plan defines phase 3 by one sentence: "workout completo registrado **con
 * wifi apagado**, sincronizado al volver la red, con animación de PR". Everything else in the
 * phase is unit-tested, and unit tests cannot say that sentence: being offline is a browser
 * state, not a function's, and the queue that survives it is the integration of the store, the
 * persister and TanStack's own pause/resume — none of which the other suites exercise together.
 *
 * One thing it deliberately does not prove: nothing here checks *how* the write reached the
 * database. What it checks is that the server answered, which is stronger — the records it shows
 * can only come from `save_workout`, and that RPC writes the workout and computes the records in one
 * transaction.
 *
 * It also walks the read side once the write has landed: the history lists the session, the detail
 * shows its sets, and the exercise name opens the progress screen. That assertion used to be absent
 * because the history was a placeholder; it is not one any more, and the read side is where a write
 * that only half arrived would show up — every assertion above would still pass while the session
 * was lost to the user.
 *
 * And it repeats the session, which is the only flow in the app that reads the **stored order** of the
 * cards: the copy carries the exercises, in that order, with what was aimed for and with no sets,
 * because the weights come from the history and not from the copy. The confirmation that guards an
 * unsaved draft is unit-tested and not covered here: reproducing it end-to-end would need a second
 * recorded session left open, and the flow above is already long.
 */

/** Long enough for the local stack's policy, and not a real secret. */
const PASSWORD = 'gymtracker-e2e-2026';

/** Reps and kilos, in the order they are typed. A first session beats nothing, so all three are records. */
const SETS = [
  [10, 40],
  [5, 100],
  [5, 105],
] as const;

test('records a workout offline and syncs it when the connection comes back', async ({
  page,
  context,
}) => {
  /*
   * The one failure this suite must never have, asserted rather than trusted.
   *
   * The credentials come from the local stack (`playwright.config.ts`) and the application
   * inlines them at build time, so a misconfigured or stale build would quietly send the
   * session to the hosted project and write test workouts into real data. Watching the
   * requests is how that becomes a red test instead of something noticed later.
   */
  const hostedHosts = new Set<string>();

  page.on('request', (request) => {
    const { hostname } = new URL(request.url());

    if (hostname.endsWith('supabase.co')) {
      hostedHosts.add(hostname);
    }
  });

  /*
   * A fresh address every run. The local stack keeps what it holds, so a fixed one would be a
   * duplicate account on the second run — and a new account is also what makes every set of
   * this session a personal record, for the same reason: `personal_records` is per user.
   */
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Persona de prueba');
  await page.getByLabel('Email').fill(email);
  // Anchored: `Contraseña` is a substring of `Repetí la contraseña`.
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetí la contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Confirmation is off locally, so registering signs the user in and the shell takes over.
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();

  await page.getByRole('link', { name: 'Entrenar' }).click();
  await page.getByRole('button', { name: 'Nuevo workout' }).click();
  await page.getByLabel('Título').fill('Empuje');

  await page.getByRole('button', { name: 'Agregar ejercicio' }).click();
  /*
   * `exact` because the accessible name matches as a substring by default, and the seeded
   * catalogue also holds "Press Banca Declinado" and "Press Banca Inclinado": without it the
   * locator is ambiguous and Playwright refuses to guess, which is the behaviour you want.
   */
  await page.getByRole('button', { name: 'Press Banca', exact: true }).click();

  /*
   * The target the session sets for itself, typed on the card. It travels in the payload, and a
   * payload the RPC cannot read fails the whole save -- so the records arriving at the end of this
   * test are also the evidence that these three values reached the database, not just the screen.
   */
  await page.getByLabel('Reps del objetivo').fill('8');
  await page.getByLabel('Peso mínimo del objetivo').fill('60');
  await page.getByLabel('Peso máximo del objetivo').fill('80');

  for (const [index, [reps, weight]] of SETS.entries()) {
    const position = index + 1;

    await page.getByRole('button', { name: '+ serie' }).click();
    await page.getByLabel(`Reps serie ${position}`).fill(String(reps));
    await page.getByLabel(`Peso en kg serie ${position}`).fill(String(weight));
  }

  /*
   * The connection is cut here and not earlier: the catalogue is cached, the draft lives in
   * IndexedDB, and the point is to finish a workout with nothing available but the device.
   */
  await context.setOffline(true);

  await page.getByRole('button', { name: 'Finalizar' }).click();

  // The session is over and nothing has been written. This is the half of the DoD that says
  // the workout was recorded with the network off: the app says what it is holding.
  await expect(page.getByText('1 entrenamiento pendiente de sincronizar')).toBeVisible();

  await context.setOffline(false);

  /*
   * And this is the other half. The records are the assertion because they cannot be faked
   * locally: `new_prs` only exists in the answer to `save_workout`, so seeing them means the
   * server took the write — which is exactly what "sincronizado al volver la red" claims.
   */
  await expect(page.getByRole('status', { name: 'Récords nuevos' })).toBeVisible();

  /*
   * The mark is asserted and not just the name, because it is the server's arithmetic and not
   * the screen's: 40 kg for 10 reps is 53.3 by the Epley formula the RPC applies. Nothing local
   * can produce that number, so seeing it is proof the write reached the database and came back.
   */
  await expect(page.getByText('primera marca: 53.3 kg de 1RM')).toBeVisible();

  // The queue drained, so the badge has nothing left to report.
  await expect(page.getByText('1 entrenamiento pendiente de sincronizar')).toBeHidden();

  /*
   * The read side, once the write has landed. Not a second suite for the history screen: it is the
   * other half of the same sentence. A workout the server accepted and the list cannot show would
   * pass everything above and still be lost to whoever recorded it.
   */
  await page.getByRole('link', { name: 'Historial' }).click();

  const row = page.getByRole('link', { name: /Empuje/ });

  await expect(row).toBeVisible();
  await row.click();

  // The detail lists what the card wrote, one row per set.
  const sets = page.getByRole('list', { name: 'Series de Press Banca' });

  await expect(sets.getByRole('listitem')).toHaveCount(SETS.length);

  // And the exercise name is the way into its own screen, where the progress is graphed.
  await page.getByRole('link', { name: 'Press Banca', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Press Banca' })).toBeVisible();

  /*
   * Back to the session to repeat it, which is the one flow that reads the order the cards were
   * stored in. Nothing to confirm here: the write landed, so its draft was already discarded.
   *
   * `exact` because this screen carries two links named for the history: the nav's, and the back
   * link this page opens with.
   */
  await page.getByRole('link', { name: 'Historial', exact: true }).click();
  await page.getByRole('link', { name: /Empuje/ }).click();
  await page.getByRole('button', { name: 'Repetir este entrenamiento' }).click();

  // The workout screen, with a draft that is ready to be trained.
  await expect(page.getByRole('region', { name: 'Entrenar' })).toBeVisible();

  // What was aimed for travels with the copy; what was lifted does not.
  await expect(page.getByLabel('Título')).toHaveValue('Empuje');
  await expect(page.getByLabel('Reps del objetivo')).toHaveValue('8');
  await expect(page.getByLabel('Peso mínimo del objetivo')).toHaveValue('60');
  await expect(page.getByLabel('Peso máximo del objetivo')).toHaveValue('80');
  await expect(page.getByLabel('Reps serie 1')).toHaveCount(0);

  expect([...hostedHosts]).toEqual([]);
});

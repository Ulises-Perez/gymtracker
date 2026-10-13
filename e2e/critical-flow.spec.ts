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
 * Two things it deliberately does not prove. There is no assertion about the history screen,
 * because that is phase 4 and the route is still a placeholder. And nothing here checks *how*
 * the write reached the database; what it checks is that the server answered, which is
 * stronger: the records it shows can only come from `save_workout`, and that RPC writes the
 * workout and computes the records in one transaction.
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

  expect([...hostedHosts]).toEqual([]);
});

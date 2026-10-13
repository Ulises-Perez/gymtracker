import { execSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end suite.
 *
 * Its subject is one sentence from the plan: a complete workout recorded with the network off
 * and synced when it comes back. That cannot be asserted anywhere else — being offline is a
 * browser state, and the queue that survives it is the integration of the store, the persister
 * and TanStack's own pause and resume, which no unit test exercises together.
 *
 * It runs against the **local** Supabase stack, in CI and on a developer's machine (decision
 * of the user, `L24`), so a run can never touch the hosted project's data.
 */

type LocalStack = {
  url: string;
  publishableKey: string;
};

/**
 * Reads the credentials off the running stack instead of keeping a copy of them.
 *
 * Two reasons, and the second is the one that matters. A committed copy drifts the day the
 * CLI changes its defaults; and this repository's `.env` holds the **hosted** project's values,
 * so the suite's correctness depends on the local ones winning. Asking the stack that is
 * actually serving means there is nothing to get out of step.
 *
 * Both spellings of the command are tried because the CLI is on the PATH in CI (installed by
 * an action) and is reached through `npx` on this machine. `execSync` rather than `execFileSync`
 * so the shell resolves the Windows shims.
 */
function readLocalStack(): LocalStack {
  const commands = ['supabase status -o json', 'npx --no-install supabase status -o json'];

  for (const command of commands) {
    try {
      // stderr is dropped and the JSON is sliced out: the CLI prints progress lines such as
      // "Stopped services: [...]" alongside the object.
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      const status = JSON.parse(output.slice(output.indexOf('{'))) as {
        API_URL?: string;
        PUBLISHABLE_KEY?: string;
      };

      if (status.API_URL && status.PUBLISHABLE_KEY) {
        return { url: status.API_URL, publishableKey: status.PUBLISHABLE_KEY };
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    'No local Supabase stack answered. Run `supabase start` first: this suite is not allowed ' +
      'to point at the hosted project.',
  );
}

const localStack = readLocalStack();

/*
 * Set on the process rather than passed to `webServer.env`, so the build inherits them and
 * nothing has to be merged. Vite gives `process.env` precedence over `.env` — measured, not
 * assumed — and that precedence is the only thing standing between this suite and writing its
 * workouts into real data, since `.env` holds the hosted project's URL.
 */
process.env.VITE_SUPABASE_URL = localStack.url;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = localStack.publishableKey;

export default defineConfig({
  testDir: './e2e',
  /*
   * One worker, and not for speed. The suite drives a real stack and a real database: two
   * browsers at once would share it, and a failure caused by that is one nobody can reproduce.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Kept for the first retry only: a trace is the difference between knowing why a CI run
    // failed and guessing.
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    /*
     * The real production build, served as it would be deployed, instead of the dev server:
     * the app inlines its configuration at build time, and testing a build other than the one
     * that ships would test a different program.
     *
     * `--strictPort` because a stale server left on the port would be served instead of the
     * fresh build, and the suite would quietly test the previous commit.
     */
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // Generous: the command compiles the application before serving it.
    timeout: 180_000,
  },
});

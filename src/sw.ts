/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
// The routing policy is plain ESM shared with the Node tests, so it ships no types of its own. The
// contract is held by scripts/sw-rules.test.mjs rather than by the compiler; if this import ever earns
// a .d.mts beside it, this suppression will start failing loudly, which is the intent.
// @ts-expect-error -- plain-ESM rules module without a .d.mts declaration.
import { APP_SHELL_URL, SW_ROUTES } from '../scripts/sw-rules.mjs';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
};

/**
 * Prompt-based updates.
 *
 * The new worker is installed but never activated on its own, so an update
 * landing mid-set cannot reload the app under the user's fingers. Activation is
 * driven by the explicit SKIP_WAITING message that the app sends once the user
 * accepts the "nueva versión" banner (Fase 7, T7.3).
 */
self.addEventListener('message', (event) => {
  const data: unknown = event.data;

  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting();
  }
});

// App shell precache, generated from the build manifest: every static asset of
// the build (JS, CSS, HTML and fonts) is served from the cache offline.
precacheAndRoute(self.__WB_MANIFEST);

/**
 * Runtime routes, from the policy in scripts/sw-rules.mjs.
 *
 * The list holds exactly one entry -- the app shell fallback -- and the rules
 * module is where the negative half is stated and tested: no route may ever
 * answer `/auth/*`, `/rest/*`, `/storage/*` or a write. This loop is the only
 * place a route is registered, so a rule that is not in the list cannot be
 * reached.
 */
for (const rule of SW_ROUTES) {
  switch (rule.strategy) {
    case 'navigation-fallback':
      registerRoute(
        ({ request, url, sameOrigin }) =>
          rule.matches({
            pathname: url.pathname,
            method: request.method,
            mode: request.mode,
            sameOrigin,
          }),
        // The handler answers the navigation with the precached shell, so a
        // deep, client-routed URL opened offline still boots the app.
        createHandlerBoundToURL(APP_SHELL_URL),
      );
      break;
    default:
      // An unknown strategy is left unregistered: fail closed rather than
      // guess at a handler for a rule this worker does not implement.
      break;
  }
}

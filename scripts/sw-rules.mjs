/*
 * The service worker's routing policy, as data.
 *
 * A service worker cannot be imported into jsdom, so the part of it that can be wrong quietly -- which
 * requests it answers from a cache -- lives here and scripts/sw-rules.test.mjs asserts on it. src/sw.ts
 * imports these rules and registers them with Workbox; this module stays free of Workbox and of `self`
 * so that both the tests and the worker read the same definitions.
 *
 * The plan's performance table is the rule that won here: "SW = assets estáticos; TQ = datos API".
 * TanStack Query already persists the API data for seven days, so a runtime cache in the worker would
 * be a second copy that can disagree with the first -- and two caches that can disagree mean neither
 * is the truth.
 */

/**
 * Path prefixes the worker must never answer from a cache, whatever the method.
 *
 * `/auth/` is the absolute prohibition: a cached session response is served to whoever asks and
 * survives logout. `/rest/` is the API the TanStack Query persister already owns, and `/storage/`
 * holds uploaded avatars, which are user data and not app shell.
 */
export const NEVER_CACHED_PATH_PREFIXES = ['/auth/', '/storage/', '/rest/'];

/**
 * Methods that mutate server state.
 *
 * A cached write is a lie a cache cannot retract, and this product is offline-first with its own
 * durable mutation queue, so a second, cache-shaped answer here would also race that queue.
 */
export const NEVER_CACHED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Whether a request must never be answered from the service worker's cache.
 *
 * It takes a plain descriptor -- `{ pathname, method }` -- instead of a `Request` so it stays testable
 * without a DOM and so src/sw.ts can build the descriptor from the fields Workbox hands it.
 */
export function isNeverCached({ pathname, method }) {
  return (
    NEVER_CACHED_METHODS.includes(method) ||
    NEVER_CACHED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Where the precached app shell lives in the Workbox manifest (injectManifest stores it unrooted). */
export const APP_SHELL_URL = '/index.html';

/**
 * The one runtime route the worker registers: a same-origin GET navigation is answered with the
 * precached `index.html`.
 *
 * The app is client-routed, so a deep link such as `/history/abc-123` is not a file on the server; with
 * this rule a deep route opened offline still boots the app. It is a GET navigation only, and it defers
 * to `isNeverCached`, so it can never be the route that serves an API path or a write -- the two
 * mistakes this task exists to prevent.
 */
export const APP_SHELL_ROUTE = {
  name: 'app-shell-navigation',
  strategy: 'navigation-fallback',
  matches({ pathname, method, mode, sameOrigin }) {
    return (
      method === 'GET' &&
      mode === 'navigate' &&
      sameOrigin === true &&
      !isNeverCached({ pathname, method })
    );
  },
};

/**
 * Every runtime route the worker registers.
 *
 * It stays this short on purpose: static assets are precached, the API belongs to TanStack Query, and a
 * new entry here is a new cached-response decision that scripts/sw-rules.test.mjs will immediately hold
 * to the two prohibitions above.
 */
export const SW_ROUTES = [APP_SHELL_ROUTE];

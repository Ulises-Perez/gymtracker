/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

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

// App shell precache, generated from the build manifest.
precacheAndRoute(self.__WB_MANIFEST);

/**
 * Runtime caching policy is deliberately NOT defined here yet.
 *
 * T7.2 owns it: the exercise catalogue gets a StaleWhileRevalidate strategy,
 * while Supabase auth and every write endpoint must never be cached — a cached
 * auth response or a cached POST is how an offline-first app corrupts data.
 */

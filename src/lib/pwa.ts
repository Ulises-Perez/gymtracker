import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker.
 *
 * The service worker runs in `prompt` mode: an update is downloaded in the
 * background but stays waiting until the user accepts it, so no reload can
 * interrupt a workout in progress. The banner that asks the user belongs to
 * Fase 7 (T7.3); this function only wires the registration.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  registerSW({ immediate: true });
}

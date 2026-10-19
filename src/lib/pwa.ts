import { registerSW } from 'virtual:pwa-register';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

/**
 * Whether a downloaded worker is waiting for permission to take over.
 *
 * Held outside React on purpose. `main.tsx` registers the worker before anything renders — it has to,
 * because a registration that waits for a component would not exist on the first visit — and the
 * callback that says "a new version is waiting" fires with no component necessarily mounted. So the
 * registration owns the state and the tree subscribes to it, which is also what keeps the reload off
 * the render path.
 */
let waiting = false;

/** The plugin's own handle; sending `SKIP_WAITING` is what lets the waiting worker activate. */
let updateServiceWorker: UpdateServiceWorker | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Registers the service worker.
 *
 * The service worker runs in `prompt` mode: an update is downloaded in the background but stays
 * waiting until the user accepts it, so a reload can never interrupt a workout in progress. The
 * callback below is the whole of that promise on this side — it raises a flag and tells the tree, and
 * it starts no timer and no reload. The reload happens only in `acceptUpdate`, which is only reached
 * from the banner's button.
 */
export function registerServiceWorker(): void {
  /*
   * A registration starts with nothing waiting, which is a fact about startup rather than a reset:
   * this runs once per page load, from `main.tsx`.
   */
  waiting = false;

  if (!('serviceWorker' in navigator)) {
    return;
  }

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      notify();
    },
  });
}

/** Subscribes to the waiting-worker flag. Returns its own teardown, for `useSyncExternalStore`. */
export function subscribeToUpdate(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** The snapshot the tree reads: a boolean, so it is referentially stable. */
export function isUpdateWaiting(): boolean {
  return waiting;
}

/**
 * Accepts the update, and only ever on the user's word.
 *
 * `updateServiceWorker()` is the plugin's own sequence: it posts `SKIP_WAITING` to the waiting worker,
 * and the reload follows from the `controlling` event the plugin listens for from the moment it
 * reported the waiting worker. That is why nothing here decides to reload — the page is never told to
 * reload before this function is called, so a download landing mid-set can only ever produce a banner.
 *
 * The flag is left set on purpose. If the reload never happens the banner stays, and the button can be
 * pressed again; clearing it here would make a failed update look like a completed one.
 */
export async function acceptUpdate(): Promise<void> {
  if (updateServiceWorker === null) {
    return;
  }

  await updateServiceWorker();
}

import { useEffect } from 'react';

/**
 * Keeps the screen awake while a workout is running.
 *
 * Everything here is best-effort, and that is the whole design: the Wake Lock API
 * is missing on older iOS and, where it exists there, only works for installed
 * PWAs; even where it exists a request can be refused. In every one of those cases
 * the screen may dim mid-set, the workout keeps working, and there is nothing the
 * user could do about it — so the failure is swallowed rather than surfaced. An
 * error message nobody can act on is just noise on the screen in the middle of a
 * set.
 *
 * The other half is that the browser drops the lock on its own whenever the page
 * is hidden, and tells nobody except through the sentinel's own `release` event.
 * Coming back to the screen is the only signal there is that it has to be taken
 * again.
 */

/**
 * The slice of the API this app uses.
 *
 * Typed by hand rather than leaning on the DOM lib: `wakeLock` is still missing
 * from parts of it, and a type that only exists in newer lib versions would make
 * the hook's availability depend on a TypeScript upgrade.
 */
type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockApi = {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
};

function wakeLockApi(): WakeLockApi | undefined {
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
}

export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const api = wakeLockApi();

    if (!api) {
      return;
    }

    // A non-optional alias: the guard above narrows `api` for this scope but not
    // inside `acquire`, which is a function body of its own that runs later.
    const wakeLock: WakeLockApi = api;

    let sentinel: WakeLockSentinelLike | null = null;
    let pending = false;
    let cancelled = false;

    async function acquire(): Promise<void> {
      // Guarded twice on purpose: a lock already held needs no second request, and
      // two visibility events landing before the first request resolves must not
      // leave the app holding two locks it will never release.
      if (sentinel || pending) {
        return;
      }

      pending = true;

      try {
        const lock = await wakeLock.request('screen');

        if (cancelled) {
          // The effect was torn down while the request was in flight. A lock
          // nobody will release is worse than no lock at all.
          void lock.release();

          return;
        }

        sentinel = lock;
        lock.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        sentinel = null;
      } finally {
        pending = false;
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);

      if (sentinel) {
        void sentinel.release();
      }
    };
  }, [enabled]);
}

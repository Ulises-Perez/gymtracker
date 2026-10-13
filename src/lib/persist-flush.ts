import { flushQueryCache } from './queryClient.ts';

/**
 * Writes the queue to disk before the page goes away.
 *
 * This closes the last piece of the loss window: the persister throttles its own
 * writes, so whatever the user did in the final seconds of a session can still be
 * in memory when the tab closes. Two signals, because neither is enough alone —
 * `pagehide` is the last event a closing tab or an installed PWA reliably emits,
 * while mobile backgrounding often produces no `pagehide` at all and only hides
 * the page.
 *
 * Called once from `main.tsx`. It returns its own teardown so a test never leaves
 * listeners behind that would fire into the next test's state.
 */
export function installPersistFlush(): () => void {
  const writeThrough = () => {
    // Deliberately not awaited: the flush has to start before the page is gone,
    // and by then there is nothing left that could wait for it. The storage call
    // opens its IndexedDB transaction synchronously, which is what makes the
    // write survive even though the promise is never awaited.
    void flushQueryCache();
  };

  const onVisibilityChange = () => {
    // `visibilitychange` also fires on the way back to visible; flushing on every
    // tab switch would serialise the whole cache each time.
    if (document.visibilityState === 'hidden') {
      writeThrough();
    }
  };

  window.addEventListener('pagehide', writeThrough);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('pagehide', writeThrough);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

import { useSaveSync } from '../../hooks/useSaveSync.ts';

/**
 * Whether anything is still waiting to reach the server.
 *
 * It sits in the shell rather than in the workout screen on purpose: the moment the user
 * needs to know is the moment they have left that screen, or closed the app and come back to
 * a queue that is still holding something.
 *
 * It reads the queue and nothing else. Reading the draft as well would let it say "no se pudo
 * guardar" from anywhere, but it would also pull the workout store — and zustand with it —
 * into the initial bundle, since the shell is downloaded on first paint. The screen that owns
 * the draft already reports the failure and offers the retry; this only has to answer "is
 * anything still on its way".
 */
export function SyncBadge() {
  const waiting = useSaveSync();

  if (waiting === 0) {
    return null;
  }

  return (
    <p
      // A live region: a write can be queued while the user is looking somewhere else, and
      // there is no other sign of it anywhere in the app.
      role="status"
      /*
       * Ink and not the muted tone, and it is a contrast decision rather than a tonal one: this
       * sentence is the only sign in the whole app that a session has not reached the server yet, and
       * muted (#6b6a66) on this surface (#e9e7e1) measures 4.38:1 -- just under the 4.5:1 AA asks of
       * normal text. Ink on the same surface measures 14.48:1.
       */
      className="border-rule bg-surface text-text rounded-sm border px-3 py-2 text-center text-sm"
    >
      {waiting === 1
        ? '1 entrenamiento pendiente de sincronizar'
        : `${waiting} entrenamientos pendientes de sincronizar`}
    </p>
  );
}

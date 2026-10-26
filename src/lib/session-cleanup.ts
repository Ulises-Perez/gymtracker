import { useWorkoutStore, WORKOUT_STORAGE_KEY } from '../stores/workout-store.ts';
import { queryClient, queryPersister } from './queryClient.ts';
import { indexedDbStorage } from './storage.ts';

/**
 * Everything this device remembers about the account that just left.
 *
 * The session is not the only thing that outlives a logout. The query cache is
 * persisted for seven days, the workout draft is the only copy of a session in
 * progress, and the queue can hold a write that was paused while offline. None of
 * those names its owner, so clearing them is what keeps the next account on this
 * device from reading them — or, worse, resuming A's paused workout with B's JWT.
 *
 * `queryClient.clear()` is the in-memory half; `removeClient()` is the persisted
 * half. Both are needed: clearing only the first leaves the blob on disk, and
 * clearing only the second leaves it in the tab that is still open.
 *
 * The draft is discarded through the store so its persisted copy is rewritten as
 * empty. The promise is shared while it runs, so a logout that fires more than once
 * (the SDK emits SIGNED_OUT and the caller may also react) does the work once.
 */
let clearing: Promise<void> | null = null;

export async function clearLocalUserData(): Promise<void> {
  if (clearing !== null) {
    return clearing;
  }

  clearing = (async () => {
    queryClient.clear();
    useWorkoutStore.getState().discard();

    // `discard()` rewrites the persisted draft, but a storage write can fail and
    // the old bytes would survive. Removing the key is the second half: if the
    // rewrite raced or failed, there is no draft left to hand to the next account.
    await indexedDbStorage.removeItem(WORKOUT_STORAGE_KEY).catch(() => undefined);

    // Best effort: a browser that refuses to open IndexedDB must not make the
    // logout fail. The in-memory cache and the draft are already gone.
    try {
      await queryPersister.removeClient();
    } catch {
      // The next read starts from an empty cache either way; the blob is only
      // a stale copy that this browser will not serve while it is signed out.
    }
  })();

  try {
    await clearing;
  } finally {
    clearing = null;
  }
}

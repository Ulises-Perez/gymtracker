import type { QueryClient } from '@tanstack/react-query';

import { useWorkoutStore } from '../stores/workout-store.ts';
import { queuedMutationKind } from './queued-mutations.ts';
import type { QueuedMutationVariables } from './queued-mutations.ts';
import { queryClient } from './queryClient.ts';
import { markStaleAfterSave } from './stale-after-write.ts';

/**
 * Clears the draft once its write has landed, however late that is.
 *
 * This exists because of a fact about the queue rather than a preference. A save reaches
 * `success` more than once in a workout's life: right away when there is a connection, and
 * minutes later when a paused one is resumed after the app was closed. But
 * `shouldDehydrateMutation` persists only paused mutations, and what is persisted is the
 * mutation's state, scope and meta — never its callbacks. So the hook's `onSuccess` fires
 * only while that particular hook happens to be mounted, which is exactly what a reload
 * destroys.
 *
 * Without this, "saved" is unknowable after a reload and the two states the badge has to tell
 * apart collapse into one: a workout that was written and a workout that failed both look
 * like a finished draft with nothing in the queue. With it, the draft is the durable intent
 * and the queue is derived from it — a finished draft with no live entry can only mean the
 * write did not land.
 *
 * Called once from `main.tsx`, and it returns its own teardown so a test does not leave a
 * listener behind that would fire into the next test's state.
 *
 * It also marks the catalogue stale, and that is not a second responsibility so much as the same
 * one finished. `save_workout` is what creates the custom exercises a session used, so the moment
 * the write lands the catalogue is out of date — and a resumed write lands with no `onSuccess`
 * mounted, because the queue never persists callbacks. Watching the cache itself is what lets the
 * invalidation cover the resumed path too; leaving it in the hook alone would keep defect D3 alive
 * for exactly the offline session it was written about.
 *
 * The client is an argument with the application's own as the default, for the same reason
 * `createQueryClient` takes the dispatcher as one: a screen test builds its client, and a
 * subscription nailed to the singleton would be a behaviour those tests could not exercise.
 */
export function installSaveSync(client: QueryClient = queryClient): () => void {
  return client.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.mutation.state.status !== 'success') {
      return;
    }

    const variables = event.mutation.state.variables;

    // Read off the payload and not off the mutation key: the key is an invitation to count
    // pending writes, while `kind` is what the entry says about itself, and it survives the
    // round trip through storage that a resumed write takes.
    if (queuedMutationKind(variables) !== 'save-workout') {
      return;
    }

    /*
     * Marked, not refetched, for the same reason the hook does it: a background request deciding
     * the moment could turn a cached read into an error screen while the user is offline. The
     * invalidation is tied to the write landing and not to the draft, so it covers a resumed save
     * even on the runs where the draft was already cleared. And it is the same list the hook uses,
     * so a read added to one of the two is not missing from the other.
     */
    markStaleAfterSave(client);

    // Guarded rather than assumed: these variables came out of a persisted entry, which is
    // to say out of JSON written by some earlier build.
    const workoutId = (variables as QueuedMutationVariables).payload?.id;

    if (typeof workoutId !== 'string') {
      return;
    }

    const { draft, discard } = useWorkoutStore.getState();

    /*
     * Twice over, and both conditions earn their place. The id says the write was about this
     * workout, since the payload carries the id the draft created. The status says the
     * workout is over: a payload is built from the frozen draft, so a match against an open
     * one cannot happen through the app — but being wrong here would destroy a session in
     * progress, and that is not a risk worth taking to save a clause.
     */
    if (!draft || draft.status !== 'finished' || draft.workoutId !== workoutId) {
      return;
    }

    discard();
  });
}

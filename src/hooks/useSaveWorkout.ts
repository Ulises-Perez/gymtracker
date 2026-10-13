import { useMutation } from '@tanstack/react-query';

import { dispatchQueuedMutation } from '../lib/queued-mutations.ts';
import type { QueuedMutationVariables } from '../lib/queued-mutations.ts';
import { toSaveWorkoutPayload } from '../lib/workout-payload.ts';
import type { SaveWorkoutResult } from '../schemas/workout.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';

/**
 * The key every queued save is filed under.
 *
 * A restored write does not need it — the client's default mutation function is what
 * makes it runnable again — but it is what makes the queue inspectable: the sync badge
 * counts pending writes by this key, and `save_workout` is the only thing the queue
 * carries today.
 */
export const SAVE_WORKOUT_MUTATION_KEY = ['save-workout'] as const;

/**
 * Finishing a workout, and the one place the order of it is written down.
 */
export function useSaveWorkout() {
  const mutation = useMutation<SaveWorkoutResult, Error, QueuedMutationVariables>({
    mutationKey: SAVE_WORKOUT_MUTATION_KEY,
    /*
     * The cast is the price of the bundle split. `dispatchQueuedMutation` is reachable
     * from the initial bundle and so returns `unknown`, which is what keeps Zod out of
     * it; the handler it loads validates the result before handing it back, so this is
     * already a `SaveWorkoutResult`. Asserting costs nothing at runtime, while parsing
     * the schema again would pull Zod into a screen chunk to re-check the same bytes.
     */
    mutationFn: async (variables) => (await dispatchQueuedMutation(variables)) as SaveWorkoutResult,
  });

  /**
   * Freezes the session and queues it, in that order.
   *
   * The order is the reason this lives here rather than in the screen. `finish()` is what
   * sets `endedAt`, and the payload's duration is measured between the two timestamps —
   * so a payload built from the draft the screen is holding would carry the length of the
   * session as it was before the freeze, and never include the last set.
   */
  function finishAndQueue(): void {
    if (useWorkoutStore.getState().draft?.status !== 'draft') {
      /*
       * Nothing open. Guarded here as well as inside `finish()` because a second tap
       * would otherwise queue the same payload twice: harmless in the database, where
       * the RPC replaces the workout's sets, but not on screen, where the records would
       * be announced all over again.
       */
      return;
    }

    useWorkoutStore.getState().finish();

    // Read back instead of reusing the draft read above: this is the frozen one.
    const finished = useWorkoutStore.getState().draft;

    if (!finished) {
      return;
    }

    mutation.mutate({ kind: 'save-workout', payload: toSaveWorkoutPayload(finished) });
  }

  return {
    finishAndQueue,
    mutate: mutation.mutate,
    reset: mutation.reset,
    status: mutation.status,
    data: mutation.data,
    error: mutation.error,
  };
}

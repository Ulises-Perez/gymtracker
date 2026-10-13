import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dispatchQueuedMutation, SAVE_WORKOUT_MUTATION_KEY } from '../lib/queued-mutations.ts';
import type { QueuedMutationVariables } from '../lib/queued-mutations.ts';
import { toSaveWorkoutPayload } from '../lib/workout-payload.ts';
import type { SaveWorkoutResult } from '../schemas/workout.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';

/**
 * Finishing a workout, and the one place the order of it is written down.
 */
export function useSaveWorkout() {
  const queryClient = useQueryClient();

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
    /**
     * Defect D3: the catalogue is stale the moment the write lands, and only then.
     *
     * `save_workout` is what creates the custom exercises the session used, and the
     * catalogue query is cached with `staleTime: Infinity` behind a 7-day `maxAge` — so
     * without this, an exercise the user invented and saved stays invisible to the picker
     * for the rest of that window, and the write looks like it was lost.
     *
     * It waits for success rather than firing when the user taps finish, because a save
     * made offline has not changed anything yet. Marked without refetching, so it is the
     * picker's next mount that refreshes it: a background request deciding the moment
     * could turn a cached catalogue into an error screen while the user is offline.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog'], refetchType: 'none' });
    },
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

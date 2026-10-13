import { useIsMutating } from '@tanstack/react-query';

import { SAVE_WORKOUT_MUTATION_KEY } from '../lib/queued-mutations.ts';

/**
 * How many saves are queued and not yet written.
 *
 * Read through `useIsMutating` rather than by walking the cache by hand, and that is not
 * only brevity: it returns a number, which is referentially stable. A hook that rebuilt an
 * array of mutation states on every render would re-render on every render.
 *
 * What it counts is exactly the writes that are still pending — a paused one waiting for the
 * connection to come back, and one that is retrying right now. A write that has landed or
 * one that has run out of retries is not in the queue any more, and telling those two apart
 * is the caller's job: the workout screen knows which draft it is looking at, and this hook
 * deliberately does not, because the badge that uses it sits above every route.
 */
export function useSaveSync(): number {
  return useIsMutating({ mutationKey: SAVE_WORKOUT_MUTATION_KEY });
}

import { useWorkoutStore } from '../stores/workout-store.ts';
import { useSaveSync } from './useSaveSync.ts';

/**
 * Whether replacing the stored workout would throw away the only copy of a session.
 *
 * The rule is one sentence — *there is a draft, and the queue has not captured it* — and it lives
 * here instead of being written again in each screen because the two copies already drifted: one
 * screen protected only a finished draft with an empty queue, the other only an open draft, and
 * each missed the case the other covered.
 *
 * Why it reads the way it does: the queue only captures a draft at `finishAndQueue`, when the
 * session is frozen and its payload is built. So an **open** draft is never in the queue, and a
 * **finished** draft with no queued write is one whose retries ran out and is no longer in it
 * either. Only a finished draft with a write still queued is captured, and only that case can be
 * replaced without asking.
 *
 * Equivalence with the workout screen's old `draft?.status === 'finished' && waiting === 0`, on the
 * states that screen renders: with no draft both are false, and an open draft sends it down the
 * editor branch where this value is never read. It differs only for that unrendered case, which is
 * exactly what lets the detail screen protect an open draft as well. The workout screen's own tests,
 * unchanged, are the evidence that the extraction kept its behaviour.
 */
export function useDraftReplacement(): boolean {
  const draft = useWorkoutStore((state) => state.draft);
  const waiting = useSaveSync();

  return draft !== null && (draft.status === 'draft' || waiting === 0);
}

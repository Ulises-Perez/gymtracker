import { useInfiniteQuery } from '@tanstack/react-query';

import { fetchWorkoutPage } from '../lib/history-api.ts';
import type { WorkoutCursor } from '../lib/history-api.ts';

/**
 * The history, one page at a time.
 *
 * The user id is part of the query key for the same reason it is in the catalogue: the cache
 * outlives the session, and on a shared device the second account must never be served the first
 * one's workouts.
 *
 * Disabled rather than sent with an empty id, like `useCatalog` next to it: this screen is behind
 * the auth gate, so an empty id means the gate has not resolved yet, and a request keyed by it can
 * only be refused.
 */
export function useWorkoutHistory(userId: string) {
  return useInfiniteQuery({
    queryKey: ['history', userId],
    queryFn: ({ pageParam }) => fetchWorkoutPage(userId, pageParam),
    // Null starts at the newest workout; every later page gets the cursor the previous one returned.
    initialPageParam: null as WorkoutCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: userId !== '',
  });
}

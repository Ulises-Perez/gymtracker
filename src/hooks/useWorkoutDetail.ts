import { useQuery } from '@tanstack/react-query';

import { fetchWorkoutDetail } from '../lib/history-api.ts';

/**
 * One workout, with its sets.
 *
 * The user id is part of the key for the same reason it is in every other read:
 * the cache outlives the session. The id alone is not enough on a shared device —
 * the browser's own back/forward history can still point at A's workout after B
 * signs in, and a cached entry keyed only by the workout would render it.
 *
 * `enabled` rather than a request with an empty id: the route only has an id once
 * it has matched, and a request keyed by nothing can only be refused.
 *
 * No `staleTime`, unlike the catalogue: this is a screen the user reaches by
 * asking for it, and reading it fresh is both cheap and the point. Showing
 * yesterday's copy of a workout they just deleted would be worse than a moment of
 * waiting.
 */
export function useWorkoutDetail(userId: string, workoutId: string) {
  return useQuery({
    queryKey: ['workout', userId, workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId),
    enabled: userId !== '' && workoutId !== '',
  });
}

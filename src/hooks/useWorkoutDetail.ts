import { useQuery } from '@tanstack/react-query';

import { fetchWorkoutDetail } from '../lib/history-api.ts';

/**
 * One workout, with its sets.
 *
 * `enabled` rather than a request with an empty id: the route only has an id once it has matched,
 * and a request keyed by nothing can only be refused.
 *
 * No `staleTime` and no persistence, unlike the catalogue: this is a screen the user reaches by
 * asking for it, and reading it fresh is both cheap and the point. Showing yesterday's copy of a
 * workout they just deleted would be worse than a moment of waiting.
 */
export function useWorkoutDetail(workoutId: string) {
  return useQuery({
    queryKey: ['workout', workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId),
    enabled: workoutId !== '',
  });
}

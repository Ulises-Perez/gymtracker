import { useQuery } from '@tanstack/react-query';

import { fetchCatalog, fetchLastSets } from '../lib/catalog-api.ts';

/**
 * The exercise catalogue, cached for good.
 *
 * `staleTime: Infinity` because the catalogue is the one thing the picker cannot
 * afford to wait for: it has to open instantly and it has to work with no signal.
 * The query is written to IndexedDB by the app's persister, and the persister's
 * 7-day `maxAge` is what eventually refreshes it — not a refetch on navigation.
 * A custom exercise created on this device invalidates the key explicitly
 * (T3.8), because that is the one change the user has to see immediately.
 *
 * The user id is part of the key, and that is load-bearing: the catalogue includes
 * the user's custom exercises and the cache outlives the session, so on a shared
 * device a second account must not be served the first one's list.
 */
export function useCatalog(userId: string) {
  return useQuery({
    queryKey: ['catalog', userId],
    queryFn: () => fetchCatalog(userId),
    staleTime: Infinity,
  });
}

/**
 * The sets of the most recent workout that used this exercise.
 *
 * Disabled rather than sent with an empty id: a card that has no exercise yet has
 * nothing to look up, and a request per keystroke would be noise. The cache is
 * what the card reads on later visits to the same exercise.
 */
export function useLastSets(exerciseId: string) {
  return useQuery({
    queryKey: ['last-sets', exerciseId],
    queryFn: () => fetchLastSets(exerciseId),
    enabled: exerciseId !== '',
  });
}

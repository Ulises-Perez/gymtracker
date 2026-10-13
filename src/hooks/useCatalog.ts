import { useQuery } from '@tanstack/react-query';

import { fetchCatalog, fetchLastSets } from '../lib/catalog-api.ts';

/**
 * The exercise catalogue, cached for good.
 *
 * `staleTime: Infinity` because the catalogue is the one thing the picker cannot
 * afford to wait for: it has to open instantly and it has to work with no signal.
 * The query is written to IndexedDB by the app's persister, and the persister's
 * 7-day `maxAge` is what eventually refreshes it — not a refetch on navigation.
 *
 * Two things deliberately cut into that window, and both exist because of the same
 * change: a custom exercise the user invented on this device. While the session is
 * open the picker is handed the definitions straight from the draft, since the
 * catalogue has never heard of them (T3.8b); and when the workout that uses them is
 * saved, the key is marked stale (T3.9b, defect D3), because the write is what creates
 * the rows. Without the second one an exercise the user invented and saved stays
 * invisible to the picker for a week — the write succeeds and the app looks like it
 * lost it.
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
    // Disabled rather than sent with an empty id, the same way `useLastSets` does it
    // below: the screen is behind the auth gate, so an empty id means the gate has not
    // resolved yet, and a request keyed by it can only be refused.
    enabled: userId !== '',
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

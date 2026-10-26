import { useQuery } from '@tanstack/react-query';

import { fetchCatalog, fetchLastSets } from '../lib/catalog-api.ts';

/**
 * The exercise catalogue, cached for a day.
 *
 * `staleTime` is 24 hours and **not** `Infinity`. The old comment said the persister's
 * 7-day `maxAge` would refresh it, but `maxAge` is measured from the envelope's
 * timestamp, and the app rewrites that timestamp on every cache change and on
 * `pagehide`: the envelope never gets old, so the catalogue never expired. A real
 * `staleTime` is what lets a name added to the seed, or a custom exercise created on
 * another device, reach an install that already exists.
 *
 * Two things still cut into the window: a custom exercise invented on this device is
 * handed to the picker from the draft while the session is open (T3.8b), and a
 * successful save marks the key stale (T3.9b, D3), because the write is what creates
 * the rows.
 *
 * The user id is part of the key, and that is load-bearing: the catalogue includes
 * the user's custom exercises and the cache outlives the session, so on a shared
 * device a second account must not be served the first one's list.
 */
const CATALOG_STALE_TIME = 24 * 60 * 60 * 1000;

export function useCatalog(userId: string) {
  return useQuery({
    queryKey: ['catalog', userId],
    queryFn: () => fetchCatalog(userId),
    staleTime: CATALOG_STALE_TIME,
    // Disabled rather than sent with an empty id, the same way `useLastSets` does it
    // below: the screen is behind the auth gate, so an empty id means the gate has not
    // resolved yet, and a request keyed by it can only be refused.
    enabled: userId !== '',
  });
}

/**
 * The sets of the most recent workout that used this exercise.
 *
 * The user id is in the key for the same reason it is in the catalogue: the cache
 * outlives the session, and the exercise id is a **global** catalogue id shared by
 * every account. Without the owner, the second account on a shared device sees the
 * first account's last weights — and the next set seeds from them.
 *
 * Disabled rather than sent with an empty id: a card that has no exercise yet has
 * nothing to look up, and a request per keystroke would be noise. The cache is
 * what the card reads on later visits to the same exercise.
 */
export function useLastSets(userId: string, exerciseId: string) {
  return useQuery({
    queryKey: ['last-sets', userId, exerciseId],
    queryFn: () => fetchLastSets(exerciseId),
    enabled: userId !== '' && exerciseId !== '',
  });
}

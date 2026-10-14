import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { fetchCatalog } from '../lib/catalog-api.ts';
import { fetchWorkoutPage } from '../lib/history-api.ts';
import type { WorkoutCursor } from '../lib/history-api.ts';

/**
 * Warms the two screens the user is most likely to open next.
 *
 * This is the other half of S8's DoD: the dashboard answers in one call, and while the user is reading
 * it the app fetches the catalogue and the first page of the history. Both are the screens one tap
 * away — "Agregar ejercicio" on the workout screen reads the catalogue, and the nav's Historial reads
 * the list — and both are already cached with a long `staleTime`, so warming them costs one request
 * each and saves the wait at the moment the user is looking at a skeleton.
 *
 * Enabled only once the summary has arrived, which is what makes it a background task rather than a
 * competitor: firing these alongside the dashboard's own call would put three requests in flight for
 * the first byte the user is waiting for, on the connection this app is built for.
 */
export function usePrefetch(userId: string, enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || userId === '') {
      return;
    }

    /*
     * Not awaited and not caught, on purpose. This is a head start and not a requirement: if either
     * request fails the dashboard must be unaffected, and the screen that needed the data asks for it
     * again when it opens. Awaiting here would make the dashboard's own render depend on two things it
     * does not need.
     */
    void queryClient.prefetchQuery({
      queryKey: ['catalog', userId],
      queryFn: () => fetchCatalog(userId),
    });

    void queryClient.prefetchInfiniteQuery({
      queryKey: ['history', userId],
      queryFn: ({ pageParam }) => fetchWorkoutPage(userId, pageParam),
      initialPageParam: null as WorkoutCursor | null,
      // The same function the screen's own hook passes. A prefetched infinite query still has to know
      // how to continue, even when only the first page is being fetched.
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // One page: enough to fill the screen the user is about to see, and the next page is one scroll
      // away, which is time enough to fetch it.
      pages: 1,
    });
  }, [enabled, queryClient, userId]);
}

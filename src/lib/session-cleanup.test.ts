import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkoutStore, WORKOUT_STORAGE_KEY } from '../stores/workout-store.ts';
import { flushQueryCache, QUERY_CACHE_KEY, queryClient } from './queryClient.ts';
import { clearLocalUserData } from './session-cleanup.ts';
import { indexedDbStorage } from './storage.ts';

beforeEach(async () => {
  queryClient.clear();
  await indexedDbStorage.removeItem(QUERY_CACHE_KEY);
  useWorkoutStore.setState({ draft: null, hydrated: true });
});

describe('clearLocalUserData', () => {
  /**
   * The three places this device remembers an account: the cache in memory, the
   * cache on disk and the workout draft. Clearing only the first leaves the blob
   * for the next account; clearing only the second leaves the open tab serving
   * what it already has.
   */
  it('clears the in-memory cache, the persisted cache and the draft', async () => {
    queryClient.setQueryData(['dashboard', 'user-a'], { streak: 7 });
    await flushQueryCache();
    useWorkoutStore.getState().start();

    expect(await indexedDbStorage.getItem(QUERY_CACHE_KEY)).not.toBeNull();

    await clearLocalUserData();

    expect(queryClient.getQueryData(['dashboard', 'user-a'])).toBeUndefined();
    expect(useWorkoutStore.getState().draft).toBeNull();
    expect(await indexedDbStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    expect(await indexedDbStorage.getItem(WORKOUT_STORAGE_KEY)).toBeNull();
  });
});

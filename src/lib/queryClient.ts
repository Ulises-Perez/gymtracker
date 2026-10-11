import type { DehydrateOptions, Mutation, MutationFunction } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { indexedDbStorage } from './storage.ts';

export const QUERY_CACHE_KEY = 'gymtracker.query-cache.v1';

/** A week: long enough that a cached catalogue still serves an offline session. */
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * A queued mutation is resumed through this dispatcher.
 *
 * It exists because a mutation function is a function, and functions do not
 * survive serialisation: `dehydrateMutation` persists only `mutationKey`,
 * `state`, `scope` and `meta`. A restored mutation therefore carries no
 * `mutationFn` of its own, and `Mutation.continue()` reaches `execute()`, which
 * needs one.
 *
 * `MutationFunction` only receives the variables — not the mutation key — so the
 * persisted variables have to be self-describing: a discriminated union whose
 * `kind` selects the operation. That is a design constraint, not a preference.
 *
 * The parameter is typed `unknown` rather than the union because that is what
 * `defaultOptions.mutations.mutationFn` accepts; the dispatcher narrows once, at
 * its own boundary.
 */
export type QueuedMutationVariables = { kind: string } & Record<string, unknown>;

export function createQueryClient(
  resumeMutationFn?: MutationFunction<unknown, unknown>,
): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Fire the first attempt even when the browser claims to be offline.
        // Gym wifi lies constantly, and `offlineFirst` only pauses after a real
        // failure, so this is slower to give up but never slower to start.
        networkMode: 'offlineFirst',
        staleTime: 60_000,
        gcTime: CACHE_MAX_AGE,
      },
      mutations: {
        networkMode: 'offlineFirst',
        // Load-bearing, not a nicety. A mutation reaches the paused state only
        // while a retry is pending, and only paused mutations are both persisted
        // and resumed. With `retry: 0` a write made offline fails outright and
        // disappears on reload.
        retry: 3,
        ...(resumeMutationFn ? { mutationFn: resumeMutationFn } : {}),
      },
    },
  });
}

export const queryPersister = createAsyncStoragePersister({
  storage: indexedDbStorage,
  key: QUERY_CACHE_KEY,
  throttleTime: 1000,
});

/**
 * Persist exactly the paused mutations, and no more.
 *
 * `MutationCache.resumePausedMutations()` filters on `state.isPaused`, so a
 * mutation persisted in any other state would be hydrated and then never run —
 * a stuck queue entry that looks like data loss. This is also the library's own
 * default, stated explicitly because the offline guarantee depends on it and a
 * silent default change would break it.
 */
export const shouldDehydrateMutation = (mutation: Mutation): boolean => mutation.state.isPaused;

const dehydrateOptions: DehydrateOptions = { shouldDehydrateMutation };

export const persistOptions = {
  persister: queryPersister,
  maxAge: CACHE_MAX_AGE,
  dehydrateOptions,
};

/**
 * The application client.
 *
 * It is created without a resume dispatcher on purpose: there are no mutations
 * yet, and the dispatcher has to be the real `save_workout` call, which cannot
 * exist before the schema does. Fase 3 (task T3.2b) supplies it — until then a
 * persisted mutation would hydrate and never run.
 */
export const queryClient = createQueryClient();

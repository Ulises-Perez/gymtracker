import type { DehydrateOptions, Mutation, MutationFunction } from '@tanstack/react-query';
import { QueryClient, dehydrate, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { dispatchQueuedMutation } from './queued-mutations.ts';
import { indexedDbStorage } from './storage.ts';

/**
 * Version of the persisted cache format, declared once.
 *
 * It names both the storage key and the persister's buster, so bumping it
 * discards every entry written by an older build instead of trying to read a
 * shape that changed. Keeping it in one place is the point: a key bumped without
 * its buster, or the reverse, is the kind of silent mismatch that looks like
 * data loss.
 */
const CACHE_VERSION = 'v1';

export const QUERY_CACHE_KEY = `gymtracker.query-cache.${CACHE_VERSION}`;

export const CACHE_BUSTER = CACHE_VERSION;

/** A week: long enough that a cached catalogue still serves an offline session. */
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

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
        retryDelay,
        // The default mutation function is what makes a restored write runnable;
        // `queued-mutations.ts` explains why one is needed at all. It is injected
        // rather than imported here so tests can build a client with a spy.
        ...(resumeMutationFn ? { mutationFn: resumeMutationFn } : {}),
      },
    },
  });
}

/**
 * Mirror of the library's own exponential default.
 *
 * Repeated rather than imported because `defaultRetryDelay` is not exported. If
 * upstream changes its default we would keep a sane backoff, just a different
 * one — a tuning difference, not a correctness risk, which is why repeating it
 * beats having no backoff at all while online.
 */
const MAX_RETRY_DELAY = 30_000;

function retryBackoff(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, MAX_RETRY_DELAY);
}

/**
 * While offline, retry immediately — which in practice means "pause immediately".
 *
 * The retryer sleeps this delay BEFORE it checks whether it may continue, so the
 * default backoff left an offline write in `pending` for about a second after the
 * tap, and only paused mutations get persisted. A write made when the browser
 * already knows it is offline gains nothing from waiting to find out.
 *
 * While online the backoff stays: there the failure is transient, and hammering
 * the server is the wrong answer.
 */
function retryDelay(attemptIndex: number): number {
  return onlineManager.isOnline() ? retryBackoff(attemptIndex) : 0;
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
  buster: CACHE_BUSTER,
  dehydrateOptions,
};

/**
 * The application client.
 *
 * The dispatcher is supplied at the one place the app builds a client, so a
 * restored mutation is runnable from the first paint. It is passed here rather
 * than set in `defaultOptions` above because a restored mutation has no
 * `mutationFn` of its own and this default is what fills that hole; keeping it
 * as an explicit argument also lets tests build a client with a spy instead.
 */
export const queryClient = createQueryClient(dispatchQueuedMutation);

/**
 * Hands a just-restored queue a push.
 *
 * `QueryClient.mount()` resumes paused mutations only *inside* its focus and
 * online subscriptions, and neither manager fires when it subscribes — they only
 * register listeners. So a write restored by a page load that happened while the
 * connection was already healthy stayed paused until a network transition or a tab
 * switch, and when neither came it never ran at all: the bytes were durable and
 * the workout was still not saved. `PersistQueryClientProvider` calls this
 * immediately after restoring, which is the only moment that knows a queue has
 * just come back from disk.
 *
 * It takes the client as an argument so the behaviour can be pinned without
 * rebuilding the application singleton.
 */
export async function resumeQueuedMutations(client: QueryClient = queryClient): Promise<void> {
  // Returns immediately while offline, so the online subscription keeps owning
  // that case; this only covers the connection that was already up.
  await client.resumePausedMutations();
}

/**
 * Writes the cache to disk now, without waiting.
 *
 * It mirrors `persistQueryClientSave` — same dehydrate options, same envelope —
 * and differs in exactly one way: it writes straight to storage instead of going
 * through `queryPersister`. The persister wraps its write in a throttle that
 * sleeps with a timer, so asking it to flush on the way out of a page is asking
 * a timer to fire when the page is already gone. Nothing here waits on a timer,
 * which is the entire reason this function exists separately.
 */
export async function flushQueryCache(): Promise<void> {
  await indexedDbStorage.setItem(
    QUERY_CACHE_KEY,
    JSON.stringify({
      buster: CACHE_BUSTER,
      timestamp: Date.now(),
      clientState: dehydrate(queryClient, dehydrateOptions),
    }),
  );
}

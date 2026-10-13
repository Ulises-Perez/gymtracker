import 'fake-indexeddb/auto';
import type { Mutation, MutationFunction } from '@tanstack/react-query';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queuedSaveWorkout } from '../testing/workout-fixtures.ts';
import type { QueuedMutationVariables } from './queued-mutations.ts';
import {
  createQueryClient,
  flushQueryCache,
  persistOptions,
  queryClient,
  shouldDehydrateMutation,
} from './queryClient.ts';

const VARIABLES: QueuedMutationVariables = queuedSaveWorkout();

const failing = async (): Promise<unknown> => {
  throw new Error('Network request failed');
};

function onlyMutation(client: ReturnType<typeof createQueryClient>): Mutation {
  const mutations = client.getMutationCache().getAll();

  expect(mutations).toHaveLength(1);

  return mutations[0] as Mutation;
}

/**
 * Queues one mutation while offline, without React, and waits until it has
 * settled into whatever state its retry policy allows.
 */
async function queueOfflineMutation(
  retry: number,
  mutationFn: MutationFunction<unknown, unknown>,
  settleAs: 'paused' | 'error',
) {
  const client = createQueryClient();
  const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
    mutationKey: ['save-workout'],
    mutationFn,
    retry,
    networkMode: 'offlineFirst',
    // The retryer sleeps the retry delay BEFORE it checks whether it can
    // continue and pauses. The production default is exponential backoff, so the
    // test removes the wait to keep the assertion about pausing, not about time.
    retryDelay: 0,
  });

  // Deliberately not awaited: while offline the promise stays pending.
  void observer.mutate(VARIABLES)?.catch(() => undefined);

  await vi.waitFor(() => {
    const mutation = onlyMutation(client);

    expect(settleAs === 'paused' ? mutation.state.isPaused : mutation.state.status).toBe(
      settleAs === 'paused' ? true : 'error',
    );
  });

  return client;
}

/**
 * Persists a paused write and restores it into a brand new client.
 *
 * The app's own `persistOptions` are spread in rather than restated. These tests
 * exist to prove the offline guarantee holds under the configuration that ships,
 * and a hand-written `buster` here would keep passing while production busted
 * every persisted entry on restore.
 */
async function restartWithPausedWrite() {
  const queued = await queueOfflineMutation(3, failing, 'paused');

  await persistQueryClientSave({ queryClient: queued, ...persistOptions });

  const revived = createQueryClient();
  await persistQueryClientRestore({ queryClient: revived, ...persistOptions });

  return revived;
}

beforeEach(() => {
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('offline mutation queue', () => {
  it('pauses an offline write instead of failing it', async () => {
    const client = await queueOfflineMutation(3, failing, 'paused');
    const mutation = onlyMutation(client);

    expect(mutation.state.isPaused).toBe(true);
    expect(mutation.state.status).toBe('pending');
  });

  it('does not pause a write with no retry left, which is how writes get lost', async () => {
    // The trap this documents: with retry 0 the mutation settles as an error,
    // isPaused stays false, nothing is persisted and a reload loses the write.
    const client = await queueOfflineMutation(0, failing, 'error');
    const mutation = onlyMutation(client);

    expect(mutation.state.isPaused).toBe(false);
    expect(client.getMutationCache().getAll().filter(shouldDehydrateMutation)).toHaveLength(0);
  });

  it('carries a paused write across a restart', async () => {
    const revived = await restartWithPausedWrite();
    const restored = onlyMutation(revived);

    expect(restored.state.isPaused).toBe(true);
    expect(restored.state.variables).toEqual(VARIABLES);
    expect(restored.options.mutationKey).toEqual(['save-workout']);
  });

  it('resumes the restored write when the connection comes back', async () => {
    await restartWithPausedWrite();

    // A mutation function cannot be serialised, so the restored mutation has
    // none of its own: the client default is what makes it runnable again.
    const dispatcher = vi.fn(async (_variables: unknown) => ({ ok: true }));
    const resumable = createQueryClient(dispatcher);
    await persistQueryClientRestore({ queryClient: resumable, ...persistOptions });
    onlyMutation(resumable);
    resumable.mount();

    onlineManager.setOnline(true);

    await vi.waitFor(() => {
      expect(dispatcher).toHaveBeenCalledTimes(1);
    });
    expect(dispatcher.mock.calls[0]?.[0]).toEqual(VARIABLES);
  });

  it('restores a write with no mutation function of its own', async () => {
    const revived = await restartWithPausedWrite();
    const restored = onlyMutation(revived);

    // This is the whole reason the dispatcher exists: functions are dropped by
    // serialisation, so `Mutation.continue()` would call `execute()` with nothing
    // to run and reject with "No mutationFn found". Hence the sibling test above,
    // where the client default makes the same restored write runnable.
    expect(restored.options.mutationFn).toBeUndefined();
    expect(restored.options.mutationKey).toEqual(['save-workout']);
    expect(restored.state.variables).toEqual(VARIABLES);
  });
});

describe('how long an offline write waits before it can pause', () => {
  /*
   * The retryer sleeps `retryDelay` BEFORE it checks whether it can pause. With
   * the library's default backoff (~1 s on the first retry) an offline write sat
   * in `pending` for a full second after the user tapped save — and a pending
   * mutation is not persisted, because only paused ones are. Closing the tab in
   * that second lost the set. These two tests pin both halves of the fix: no wait
   * while offline, and the backoff kept while online.
   */
  afterEach(() => {
    vi.useRealTimers();
  });

  function queueWithFakeTimers(attempts: MutationFunction<unknown, unknown>) {
    vi.useFakeTimers();

    const client = createQueryClient();
    const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
      mutationKey: ['save-workout'],
      mutationFn: attempts,
      // No `retryDelay` here on purpose: the client default is under test.
    });

    void observer.mutate(VARIABLES)?.catch(() => undefined);

    return client;
  }

  it('pauses an offline write with no elapsed time, not after the backoff', async () => {
    const attempts = vi.fn(failing);
    const client = queueWithFakeTimers(attempts);

    // Zero elapsed time: enough for the first attempt to fail and the pause to
    // land, and not enough for a 1 s backoff to have run.
    await vi.advanceTimersByTimeAsync(0);

    expect(attempts).toHaveBeenCalledTimes(1);
    expect(onlyMutation(client).state.isPaused).toBe(true);
  });

  it('still backs off between retries while online', async () => {
    onlineManager.setOnline(true);

    const attempts = vi.fn(failing);
    queueWithFakeTimers(attempts);

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toHaveBeenCalledTimes(2);
  });
});

describe('flushing the queue to disk', () => {
  afterEach(() => {
    queryClient.clear();
  });

  /**
   * The persister wraps its own write in a throttle that sleeps with a timer, so
   * it cannot be used on the way out of a page: a timer does not fire once the
   * tab is gone. The flush writes directly instead, and this test proves the
   * result is still in the format the restore path reads — by restoring it.
   */
  it('writes the queue in the format the restore path reads', async () => {
    const marked = queuedSaveWorkout({ id: '01920000-0000-7000-8000-0000000000ff' });
    const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(queryClient, {
      mutationKey: ['save-workout'],
      mutationFn: failing,
      retry: 3,
      retryDelay: 0,
    });

    void observer.mutate(marked)?.catch(() => undefined);

    await vi.waitFor(() => {
      expect(onlyMutation(queryClient).state.isPaused).toBe(true);
    });

    await flushQueryCache();

    // A brand new client that has read nothing but what the flush wrote, using
    // the very options the app restores with.
    const revived = createQueryClient();
    await persistQueryClientRestore({ queryClient: revived, ...persistOptions });

    expect(onlyMutation(revived).state.variables).toEqual(marked);
  });
});

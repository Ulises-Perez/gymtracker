import 'fake-indexeddb/auto';
import type { Mutation, MutationFunction } from '@tanstack/react-query';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient, queryPersister, shouldDehydrateMutation } from './queryClient.ts';
import type { QueuedMutationVariables } from './queryClient.ts';

const VARIABLES: QueuedMutationVariables = { kind: 'save-workout', workoutId: 'workout-1' };

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

/** Persists a paused write and restores it into a brand new client. */
async function restartWithPausedWrite() {
  const queued = await queueOfflineMutation(3, failing, 'paused');

  await persistQueryClientSave({
    queryClient: queued,
    persister: queryPersister,
    dehydrateOptions: { shouldDehydrateMutation },
  });

  const revived = createQueryClient();
  await persistQueryClientRestore({ queryClient: revived, persister: queryPersister });

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
    await persistQueryClientRestore({ queryClient: resumable, persister: queryPersister });
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

import { MutationObserver, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { SAVE_WORKOUT_MUTATION_KEY } from '../../lib/queued-mutations.ts';
import type { QueuedMutationVariables } from '../../lib/queued-mutations.ts';
import { getSupabase } from '../../lib/supabase.ts';
import { createFakeSupabase } from '../../testing/fake-supabase.ts';
import { queuedSaveWorkout } from '../../testing/workout-fixtures.ts';
import { SyncBadge } from './SyncBadge.tsx';

vi.mock('../../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Queues a write that cannot go anywhere yet.
 *
 * The client goes offline rather than the RPC being stubbed, because that is what the badge
 * is about: a write the browser is holding, which is not the same thing as a write that
 * failed. `retry` is deliberately left alone — the default is what lets an offline write
 * pause instead of failing outright.
 */
function queueOfflineSave() {
  // The type arguments are not decoration: left to the defaults, `TVariables` is `void` and
  // the payload cannot be passed at all.
  const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
    mutationKey: SAVE_WORKOUT_MUTATION_KEY,
    retryDelay: 0,
  });

  void observer.mutate(queuedSaveWorkout())?.catch(() => undefined);
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  client = createQueryClient();
  onlineManager.setOnline(false);
});

afterEach(() => {
  // Balanced by hand: `QueryClient.unmount()` decrements a mount count and a stray one
  // leaves it negative, after which every later `mount()` returns early and the queue stops
  // resuming. Only the test that mounted calls it.
  client.clear();
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

describe('SyncBadge', () => {
  it('says nothing while everything is on the server', () => {
    render(<SyncBadge />, { wrapper });

    // Silence is the point: a permanent badge that says "all good" is noise the user learns
    // to stop reading.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says that a workout is still waiting to be synced', async () => {
    render(<SyncBadge />, { wrapper });

    queueOfflineSave();

    expect(await screen.findByText('1 entrenamiento pendiente de sincronizar')).toBeInTheDocument();
  });

  it('counts what is waiting', async () => {
    render(<SyncBadge />, { wrapper });

    queueOfflineSave();
    queueOfflineSave();

    expect(
      await screen.findByText('2 entrenamientos pendientes de sincronizar'),
    ).toBeInTheDocument();
  });

  it('goes quiet again once the write lands', async () => {
    fake.rpc.mockResolvedValue({
      data: { workout_id: queuedSaveWorkout().payload.id, new_prs: [] },
      error: null,
    });

    render(<SyncBadge />, { wrapper });

    queueOfflineSave();
    await screen.findByRole('status');

    /*
     * The connection coming back is the whole point of the badge: the queue drains and the
     * user stops needing to know about it. `mount()` before going online and not after, because
     * `mount` only resumes paused writes from inside its online subscription and that
     * subscription does not fire on subscribing (defect D1).
     */
    client.mount();
    onlineManager.setOnline(true);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    client.unmount();
  });

  /**
   * A write that ran out of retries is not in the queue any more, so the badge has nothing to
   * say about it. That is not a gap: the screen that owns the draft is the one that knows the
   * workout did not save, and it is the one that offers the retry. This badge answers only
   * "is anything still on its way".
   */
  it('says nothing about a write that already failed out of the queue', async () => {
    render(<SyncBadge />, { wrapper });

    onlineManager.setOnline(true);
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
      mutationKey: SAVE_WORKOUT_MUTATION_KEY,
      retry: false,
    });

    void observer.mutate(queuedSaveWorkout())?.catch(() => undefined);

    await waitFor(() => {
      expect(client.getMutationCache().getAll()[0]?.state.status).toBe('error');
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

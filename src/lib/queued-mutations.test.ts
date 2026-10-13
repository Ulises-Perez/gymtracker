import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import type { QueuedMutationVariables } from './queued-mutations.ts';
import { dispatchQueuedMutation, UnknownQueuedMutationError } from './queued-mutations.ts';
import { queryClient } from './queryClient.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

/**
 * A payload in the shape `save_workout(payload jsonb)` reads from. The `id` and
 * the `date` are both present on purpose: the schema below requires them, so
 * this fixture is also what pins that requirement.
 */
const PAYLOAD = {
  id: '01920000-0000-7000-8000-000000000001',
  date: '2026-10-13',
  title: 'Empuje',
  notes: null,
  duration_minutes: 52,
  sets: [
    {
      id: '01920000-0000-7000-8000-000000000002',
      exercise_id: '01920000-0000-7000-8000-000000000003',
      set_number: 1,
      reps: 5,
      weight_kg: 100,
      rpe: null,
      is_warmup: false,
      notes: null,
    },
  ],
};

const VARIABLES: QueuedMutationVariables = { kind: 'save-workout', payload: PAYLOAD };

let fake: ReturnType<typeof createFakeSupabase>;

/**
 * `QueryClient.unmount()` is not idempotent: it decrements a mount count and only
 * tears the subscriptions down when it reaches zero. Calling it without a
 * matching `mount()` leaves the count negative, and every later `mount()` then
 * returns early without subscribing to `onlineManager` — the queue would silently
 * stop resuming. So the unmount is balanced by hand instead of run blindly.
 */
let mounted = false;

beforeEach(() => {
  fake = createFakeSupabase();

  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  onlineManager.setOnline(false);
});

afterEach(() => {
  if (mounted) {
    queryClient.unmount();
    mounted = false;
  }

  queryClient.clear();
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

describe('the queued mutation dispatcher', () => {
  it('names an unknown kind instead of failing generically', async () => {
    // A queue entry restored from an older build is the realistic way this
    // happens. A bare "no mutationFn found" would not say which entry was dead.
    await expect(dispatchQueuedMutation({ kind: 'delete-everything' })).rejects.toThrow(
      UnknownQueuedMutationError,
    );
    await expect(dispatchQueuedMutation({ kind: 'delete-everything' })).rejects.toThrow(
      /delete-everything/,
    );
  });

  it('refuses variables that are not a queued entry at all', async () => {
    for (const junk of [null, undefined, 'save-workout', 42, {}, { kind: 7 }, []]) {
      await expect(dispatchQueuedMutation(junk)).rejects.toThrow(UnknownQueuedMutationError);
    }
  });

  it('calls the save_workout RPC with the payload the server reads', async () => {
    fake.rpc.mockResolvedValue({ data: { workout_id: PAYLOAD.id, new_prs: [] }, error: null });

    await expect(dispatchQueuedMutation(VARIABLES)).resolves.toEqual({
      workout_id: PAYLOAD.id,
      new_prs: [],
    });

    expect(fake.rpc).toHaveBeenCalledWith('save_workout', { payload: PAYLOAD });
  });

  it('refuses a payload the server contract would reject', async () => {
    // Routing is the dispatcher's job; payload validation belongs to the handler
    // in its own chunk. It still has to happen: an invalid entry must fail loudly
    // rather than reach the database as a partial write.
    await expect(
      dispatchQueuedMutation({ kind: 'save-workout', payload: { id: 'not-a-uuid' } }),
    ).rejects.toThrow();

    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('surfaces a server error instead of reporting a saved workout', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'Forbidden' } });

    await expect(dispatchQueuedMutation(VARIABLES)).rejects.toThrow('Forbidden');
  });
});

describe('the application client', () => {
  /**
   * The whole reason the dispatcher exists, asserted where it matters: not on a
   * client built for the test, but on the singleton the app actually uses. A
   * write made offline pauses, and the client's own default is what makes it
   * runnable again.
   */
  it('resumes an offline write through its own default mutation function', async () => {
    fake.rpc.mockImplementation(async () => {
      if (!onlineManager.isOnline()) {
        throw new Error('Network request failed');
      }

      return { data: { workout_id: PAYLOAD.id, new_prs: [] }, error: null };
    });

    // No `mutationFn` here on purpose: the client default is what is under test.
    const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(queryClient, {
      mutationKey: ['save-workout'],
      retry: 3,
      // The production default waits ~1 s before it checks whether it can pause.
      // That wait is its own task (T3.2c); here it would only slow the test.
      retryDelay: 0,
    });

    void observer.mutate(VARIABLES)?.catch(() => undefined);

    await vi.waitFor(() => {
      expect(queryClient.getMutationCache().getAll().at(-1)?.state.isPaused).toBe(true);
    });

    queryClient.mount();
    mounted = true;
    onlineManager.setOnline(true);

    await vi.waitFor(() => {
      expect(queryClient.getMutationCache().getAll().at(-1)?.state.status).toBe('success');
    });

    expect(fake.rpc).toHaveBeenCalledWith('save_workout', { payload: PAYLOAD });
  });
});

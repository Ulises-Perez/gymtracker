import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { SAVE_WORKOUT_MUTATION_KEY } from '../lib/queued-mutations.ts';
import { getSupabase } from '../lib/supabase.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { useSaveWorkout } from './useSaveWorkout.ts';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';
const WORKOUT_ID = '01920000-0000-7000-8000-000000000001';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function queued() {
  return client.getMutationCache().getAll();
}

/** The card the store just created, for the tests that need to add a set to it. */
function firstCardId(): string {
  const card = useWorkoutStore.getState().draft?.exercises[0];

  if (!card) {
    throw new Error('the draft has no exercise card to add a set to');
  }

  return card.id;
}

beforeEach(() => {
  useWorkoutStore.setState({ draft: null });

  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.rpc.mockResolvedValue({
    data: { workout_id: WORKOUT_ID, new_prs: [] },
    error: null,
  });

  client = createQueryClient();
});

describe('finishing a workout', () => {
  it('queues it once, with the duration the freeze just recorded', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);
    store.addSet(firstCardId(), { reps: 5, weightKg: 100 });

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    expect(useWorkoutStore.getState().draft?.status).toBe('finished');
    expect(useWorkoutStore.getState().draft?.endedAt).not.toBeNull();

    await waitFor(() => {
      expect(fake.rpc).toHaveBeenCalledTimes(1);
    });

    // Asserted through `toHaveBeenCalledWith` rather than by indexing `mock.calls`: the
    // fake's RPC declares no parameters, so its call tuple is empty and reading it back
    // is a type error. This also says more about the payload than the index would.
    expect(fake.rpc).toHaveBeenCalledWith('save_workout', {
      payload: expect.objectContaining({
        id: useWorkoutStore.getState().draft?.workoutId,
        exercises: [
          expect.objectContaining({
            exercise_id: PRESS_BANCA,
            sets: [
              expect.objectContaining({
                set_number: 1,
                reps: 5,
                weight_kg: 100,
              }),
            ],
          }),
        ],
        // The session lasted no time at all in a test, and an unfrozen draft would have
        // sent null here. Zero is the proof that the payload was built after `finish()`
        // and not from the draft the caller was holding.
        duration_minutes: 0,
      }),
    });
  });

  /**
   * The tap that lands twice. `save_workout` replaces the workout's sets, so the second
   * request would write the same row nowhere new — but the personal records it returns
   * would be announced again, and the queue would show two pending saves for one
   * session.
   */
  it('queues nothing more when the button is tapped twice', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();
    result.current.finishAndQueue();

    await waitFor(() => {
      expect(fake.rpc).toHaveBeenCalledTimes(1);
    });

    expect(queued()).toHaveLength(1);
  });

  it('files the write under the key the queue is counted by', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    await waitFor(() => {
      expect(queued()).toHaveLength(1);
    });

    // The badge that reports "waiting to sync" finds its work through this key, so the
    // key is part of the contract and not an implementation detail.
    expect(queued()[0]?.options.mutationKey).toEqual(SAVE_WORKOUT_MUTATION_KEY);
  });

  it('does nothing when no workout is open', () => {
    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    expect(queued()).toHaveLength(0);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('does nothing when the workout was already finished by someone else', () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.finish();

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    // `finish()` refuses the second call, and so does this: a finished draft is one the
    // payload has already been built from.
    expect(queued()).toHaveLength(0);
  });
});

/**
 * Defect D3.
 *
 * The catalogue is cached with `staleTime: Infinity` and a seven-day `maxAge`, and
 * `save_workout` is what creates the custom exercises the session used. So without an
 * invalidation, an exercise the user invented and saved stays invisible to the picker
 * for a week — the write succeeds and the app looks like it lost it.
 */
describe('what a finished save changes', () => {
  it('marks the catalogue stale, because the write is what creates the custom exercises', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);

    client.setQueryData(['catalog', 'user-1'], { exercises: [], muscleGroups: [] });

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    await waitFor(() => {
      expect(client.getQueryState(['catalog', 'user-1'])?.isInvalidated).toBe(true);
    });
  });

  it('leaves the catalogue alone when the write is still pending', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);

    client.setQueryData(['catalog', 'user-1'], { exercises: [], muscleGroups: [] });

    // Never resolves: the write is in flight for the whole test, the way it is for the
    // whole time a user is offline.
    fake.rpc.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    await waitFor(() => {
      expect(queued()).toHaveLength(1);
    });

    expect(client.getQueryState(['catalog', 'user-1'])?.isInvalidated).toBe(false);
  });

  /**
   * The defect the end-to-end suite found, and it is not about the catalogue.
   *
   * The first page of the history is prefetched while the user reads the dashboard and cached for a
   * minute, so a workout recorded seconds ago is not in it: the list answers "Todavía no registraste
   * ningún entrenamiento" about the session the user just finished, and the workout looks lost even
   * though the server took it. The catalogue was never the only read a write changes — the summary,
   * the exercise's progress and the "last time" hint are all reads of the same event.
   */
  it('marks the reads a write changes stale, so the workout shows up where it was recorded', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);

    const keys = [
      ['catalog', 'user-1'],
      ['history', 'user-1'],
      ['dashboard', 'user-1'],
      ['progress', PRESS_BANCA],
      ['last-sets', PRESS_BANCA],
    ];

    for (const key of keys) {
      client.setQueryData(key, {});
    }

    const { result } = renderHook(() => useSaveWorkout(), { wrapper });

    result.current.finishAndQueue();

    await waitFor(() => {
      expect(client.getQueryState(['history', 'user-1'])?.isInvalidated).toBe(true);
    });

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated, `[${key.join(', ')}]`).toBe(true);
    }
  });
});

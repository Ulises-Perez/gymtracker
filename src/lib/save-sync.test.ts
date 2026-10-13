import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkoutStore } from '../stores/workout-store.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { queuedSaveWorkout } from '../testing/workout-fixtures.ts';
import type { QueuedMutationVariables } from './queued-mutations.ts';
import { SAVE_WORKOUT_MUTATION_KEY } from './queued-mutations.ts';
import { queryClient } from './queryClient.ts';
import { installSaveSync } from './save-sync.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

/**
 * Defect D2, and the reason this module has to exist at all.
 *
 * A write reaches `success` more than once in a workout's life: straight away when there
 * is a connection, and minutes later when a paused one is resumed. `shouldDehydrateMutation`
 * persists only paused mutations, and what is persisted is the mutation's state, scope and
 * meta — never its callbacks. So the hook's `onSuccess` fires only when it happens to still
 * be mounted, and "this workout is saved" cannot be read off `save.status`, which is an
 * in-memory, per-mount fact. This subscription is what watches the cache itself, so the
 * draft is cleared however late the write lands, and a finished draft with nothing in the
 * queue can then only mean one thing: it did not save.
 */

const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';
const OTHER_WORKOUT = '01920000-0000-7000-8000-0000000000ff';

let fake: ReturnType<typeof createFakeSupabase>;
let uninstall: () => void;

function draft() {
  return useWorkoutStore.getState().draft;
}

/** A finished workout, the way the screen leaves it: frozen and waiting to be written. */
function finishedWorkout(): string {
  const store = useWorkoutStore.getState();

  store.start();
  store.addExercise(PRESS_BANCA);
  store.finish();

  const workoutId = draft()?.workoutId;

  if (!workoutId) {
    throw new Error('the store did not create a workout to finish');
  }

  return workoutId;
}

/** Queues one save through the real dispatcher and waits for it to settle either way. */
async function save(workoutId: string): Promise<void> {
  const variables: QueuedMutationVariables = queuedSaveWorkout({ id: workoutId });
  const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(queryClient, {
    mutationKey: SAVE_WORKOUT_MUTATION_KEY,
    retry: false,
  });

  void observer.mutate(variables)?.catch(() => undefined);

  await vi.waitFor(() => {
    const status = queryClient.getMutationCache().getAll().at(-1)?.state.status;

    expect(status === 'success' || status === 'error').toBe(true);
  });
}

beforeEach(() => {
  useWorkoutStore.setState({ draft: null });

  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.rpc.mockResolvedValue({ data: { workout_id: OTHER_WORKOUT, new_prs: [] }, error: null });

  onlineManager.setOnline(true);

  uninstall = installSaveSync();
});

afterEach(() => {
  uninstall();
  queryClient.clear();
  vi.clearAllMocks();
});

describe('clearing the draft once its write lands', () => {
  it('clears the finished workout, so a finished draft can only mean it did not save', async () => {
    const workoutId = finishedWorkout();

    await save(workoutId);

    expect(draft()).toBeNull();
  });

  /**
   * The guard that protects the user's session. A payload id that matches a draft which is
   * still open cannot happen through the app — the payload is built from the frozen draft —
   * but the cost of being wrong is destroying a workout in progress, so it is refused twice
   * over: by the status and by the id.
   */
  it('leaves a workout in progress alone, even when the id matches', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA);

    const workoutId = draft()?.workoutId ?? '';

    expect(workoutId).not.toBe('');

    await save(workoutId);

    expect(draft()?.workoutId).toBe(workoutId);
    expect(draft()?.status).toBe('draft');
  });

  it('leaves alone a draft the write was not about', async () => {
    const workoutId = finishedWorkout();

    await save(OTHER_WORKOUT);

    expect(draft()?.workoutId).toBe(workoutId);
  });

  it('keeps the draft when the write failed, because that is what failed means', async () => {
    const workoutId = finishedWorkout();

    fake.rpc.mockResolvedValue({ data: null, error: { message: 'Forbidden' } });

    await save(workoutId);

    // Nothing was written, so the session stays finished and on the device. This is the
    // case the badge reports as "no se pudo guardar" and the retry button rebuilds.
    expect(draft()?.workoutId).toBe(workoutId);
    expect(draft()?.status).toBe('finished');
  });

  it('stops watching once it is uninstalled', async () => {
    const workoutId = finishedWorkout();

    uninstall();

    await save(workoutId);

    expect(draft()?.workoutId).toBe(workoutId);
  });
});

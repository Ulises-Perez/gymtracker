import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { indexedDbStorage } from '../lib/storage.ts';
import { WORKOUT_STORAGE_KEY, useWorkoutStore } from './workout-store.ts';

const EXERCISE_ID = '01920000-0000-7000-8000-000000000010';
const OTHER_EXERCISE_ID = '01920000-0000-7000-8000-000000000011';

const store = () => useWorkoutStore.getState();
const draft = () => store().draft;

/** Reads back only what the store wrote, the way a reload would. */
async function persistedDraft(): Promise<string | null> {
  return indexedDbStorage.getItem(WORKOUT_STORAGE_KEY);
}

beforeEach(() => {
  useWorkoutStore.setState({ draft: null, hydrated: true });
});

afterEach(async () => {
  await indexedDbStorage.removeItem(WORKOUT_STORAGE_KEY);
  useWorkoutStore.setState({ draft: null });
});

describe('starting a workout', () => {
  it('opens a draft dated by the local clock', () => {
    store().start();

    expect(draft()).not.toBeNull();
    expect(draft()?.status).toBe('draft');
    expect(draft()?.exercises).toEqual([]);
    expect(draft()?.endedAt).toBeNull();
    // Version 7, so ids sort by creation time (see `lib/ids.ts`).
    expect(draft()?.workoutId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(draft()?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses to replace a workout that is still in progress', () => {
    store().start();
    const id = draft()?.workoutId;

    store().start();

    // Losing a session because a second tap landed on "new workout" is not a
    // recoverable mistake. Throwing the draft away is `discard()`'s job.
    expect(draft()?.workoutId).toBe(id);
  });

  it('opens a fresh draft after the previous one was discarded', () => {
    store().start();
    const first = draft()?.workoutId;

    store().discard();
    expect(draft()).toBeNull();

    store().start();

    expect(draft()?.workoutId).not.toBe(first);
  });
});

describe('building the draft', () => {
  beforeEach(() => {
    store().start();
    store().addExercise(EXERCISE_ID);
  });

  function firstExercise() {
    return draft()?.exercises[0];
  }

  it('opens a card per exercise, with its own id and no sets yet', () => {
    store().addExercise(OTHER_EXERCISE_ID);

    expect(draft()?.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      EXERCISE_ID,
      OTHER_EXERCISE_ID,
    ]);
    expect(firstExercise()?.sets).toEqual([]);
    expect(firstExercise()?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('adds an empty set that the inputs can fill in', () => {
    store().addSet(firstExercise()?.id ?? '');

    expect(firstExercise()?.sets).toHaveLength(1);
    expect(firstExercise()?.sets[0]).toMatchObject({
      reps: null,
      weightKg: null,
      rpe: null,
      isWarmup: false,
    });
  });

  it('can seed a set, which is how "same as last time" is expressed', () => {
    store().addSet(firstExercise()?.id ?? '', { reps: 10, weightKg: 70 });

    expect(firstExercise()?.sets[0]).toMatchObject({ reps: 10, weightKg: 70, rpe: null });
  });

  it('patches one set without touching its siblings', () => {
    const cardId = firstExercise()?.id ?? '';
    store().addSet(cardId);
    store().addSet(cardId);

    const [first, second] = firstExercise()?.sets ?? [];
    store().updateSet(cardId, first?.id ?? '', { reps: 5, weightKg: 100, rpe: 8 });

    expect(firstExercise()?.sets[0]).toMatchObject({ reps: 5, weightKg: 100, rpe: 8 });
    expect(firstExercise()?.sets[1]).toEqual(second);
  });

  it('removes a set and leaves the rest in order', () => {
    const cardId = firstExercise()?.id ?? '';
    store().addSet(cardId, { reps: 5 });
    store().addSet(cardId, { reps: 8 });
    const doomed = firstExercise()?.sets[0]?.id ?? '';

    store().removeSet(cardId, doomed);

    expect(firstExercise()?.sets.map((set) => set.reps)).toEqual([8]);
  });

  it('removes an exercise with all its sets', () => {
    const cardId = firstExercise()?.id ?? '';
    store().addSet(cardId);

    store().removeExercise(cardId);

    expect(draft()?.exercises).toEqual([]);
  });

  it('reorders exercises by index, which is what drag and drop reports', () => {
    store().addExercise(OTHER_EXERCISE_ID);

    store().reorderExercises(1, 0);

    expect(draft()?.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      OTHER_EXERCISE_ID,
      EXERCISE_ID,
    ]);
  });

  it('ignores a reorder that points outside the list', () => {
    store().addExercise(OTHER_EXERCISE_ID);

    store().reorderExercises(0, 5);
    store().reorderExercises(-1, 0);

    expect(draft()?.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      EXERCISE_ID,
      OTHER_EXERCISE_ID,
    ]);
  });

  it('keeps the draft while ignoring a set for a card that does not exist', () => {
    store().addSet('not-a-card');

    expect(draft()?.exercises[0]?.sets).toEqual([]);
  });
});

describe('finishing a workout', () => {
  beforeEach(() => {
    store().start();
    store().addExercise(EXERCISE_ID);
    store().addSet(draft()?.exercises[0]?.id ?? '', { reps: 5, weightKg: 100 });
  });

  it('closes the draft once', () => {
    store().finish();

    expect(draft()?.status).toBe('finished');
    expect(draft()?.endedAt).toEqual(expect.any(Number));
  });

  /**
   * The guard the plan asks for. A double tap on "Finalizar" must not produce a
   * second ending: `endedAt` is what the duration and the payload are built from,
   * so a second finish would change the workout that is being saved behind the
   * first one's back.
   */
  it('ignores a second finish, keeping the first ending', () => {
    store().finish();
    const endedAt = draft()?.endedAt;

    store().finish();

    expect(draft()?.endedAt).toBe(endedAt);
  });

  /**
   * A finished draft is the payload. Letting a late set in would mean the store
   * and the server disagree about what the workout contained.
   */
  it('refuses to take new work once it is finished', () => {
    store().finish();
    const finished = draft();

    store().addExercise(OTHER_EXERCISE_ID);
    store().addSet(finished?.exercises[0]?.id ?? '');
    store().updateSet(finished?.exercises[0]?.id ?? '', finished?.exercises[0]?.sets[0]?.id ?? '', {
      reps: 99,
    });
    store().removeSet(finished?.exercises[0]?.id ?? '', finished?.exercises[0]?.sets[0]?.id ?? '');
    store().setTitle('otra cosa');

    expect(draft()).toEqual(finished);
  });
});

describe('surviving a reload', () => {
  it('reads the draft back into an instance that never saw it', async () => {
    store().start();
    store().setTitle('Empuje');
    store().addExercise(EXERCISE_ID);

    const workoutId = draft()?.workoutId;

    await vi.waitFor(async () => {
      expect(await persistedDraft()).toContain(EXERCISE_ID);
    });

    const onDisk = await persistedDraft();

    /*
     * A cold start: the bytes that were on disk, and an instance that has never
     * seen them.
     *
     * Clearing the draft in memory is not enough to simulate this, because
     * `persist` writes on every state change — dropping it would wipe the very
     * entry under test. So the captured bytes are put back afterwards, which is
     * what a reload does as well, and the store's own write of the cleared state
     * is waited out first so the test does not race its own subject.
     */
    useWorkoutStore.setState({ draft: null, hydrated: false });

    await vi.waitFor(async () => {
      expect(await persistedDraft()).not.toContain(EXERCISE_ID);
    });

    await indexedDbStorage.setItem(WORKOUT_STORAGE_KEY, onDisk ?? '');

    await useWorkoutStore.persist.rehydrate();

    expect(draft()?.workoutId).toBe(workoutId);
    expect(draft()?.title).toBe('Empuje');
    expect(draft()?.exercises[0]?.exerciseId).toBe(EXERCISE_ID);
  });

  /**
   * The storage is asynchronous, so "no draft" and "not read yet" are different
   * states. The workout screen waits on this flag instead of rendering a fresh
   * draft that the restored one would then replace under the user's hands.
   */
  it('reports whether it has read the persisted draft yet', async () => {
    useWorkoutStore.setState({ hydrated: false });
    expect(draft()).toBeNull();
    expect(store().hydrated).toBe(false);

    await useWorkoutStore.persist.rehydrate();

    expect(store().hydrated).toBe(true);
  });

  it('does not persist the actions', async () => {
    store().start();

    await vi.waitFor(async () => {
      expect(await persistedDraft()).toContain('workoutId');
    });

    const persisted = JSON.parse((await persistedDraft()) ?? '{}') as Record<string, unknown>;

    // zustand's envelope, exactly: the partialised state and a format version.
    // No action can show up here, because a function does not survive JSON —
    // which is also why the queue needs a dispatcher to be resumable.
    expect(persisted).toEqual({ state: { draft: expect.any(Object) }, version: 1 });
  });
});

describe('custom exercises created on the device', () => {
  const NAME = 'Press Banca con banda';

  it('adds the definition and its card in one action', () => {
    store().start();

    store().addCustomExercise(NAME, null);

    // Two writes that have to agree: the card the user sees and the definition the
    // payload will carry. Splitting them into two actions would allow one without
    // the other, which is a workout that cannot be saved.
    expect(draft()?.customExercises).toHaveLength(1);
    expect(draft()?.customExercises[0]?.name).toBe(NAME);
    expect(draft()?.exercises).toHaveLength(1);
    expect(draft()?.exercises[0]?.exerciseId).toBe(draft()?.customExercises[0]?.id);
    expect(draft()?.exercises[0]?.sets).toEqual([]);
  });

  it('gives the custom exercise a version 7 id, like every other client id', () => {
    store().start();

    store().addCustomExercise(NAME, '01920000-0000-7000-8000-000000000020');

    expect(draft()?.customExercises[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(draft()?.customExercises[0]?.muscleGroupId).toBe('01920000-0000-7000-8000-000000000020');
  });

  it('refuses to add one to a workout that is already finished', () => {
    store().start();
    store().finish();
    const finished = draft();

    store().addCustomExercise(NAME, null);

    expect(draft()).toEqual(finished);
  });

  /**
   * The shape of the persisted draft changed, and a draft written by the previous
   * build has no `customExercises` key. Without a migration it would come back
   * `undefined` and the first `map` over it would throw — losing the workout the
   * user had in progress, which is the one thing this store exists to protect.
   */
  it('fills the new field in for a draft persisted by the previous build', async () => {
    /*
     * Nothing is written to the store before the rehydrate, and that is deliberate:
     * `persist` writes on every state change, so a `setState` to "clear" the draft
     * would overwrite the very fixture this test needs to read back. `beforeEach`
     * already leaves the in-memory draft empty, and rehydrate replaces it from
     * storage anyway.
     */
    await indexedDbStorage.setItem(
      WORKOUT_STORAGE_KEY,
      JSON.stringify({
        state: {
          draft: {
            workoutId: '01920000-0000-7000-8000-0000000000ff',
            date: '2026-10-01',
            title: 'Viejo',
            notes: '',
            startedAt: 1,
            endedAt: null,
            status: 'draft',
            exercises: [],
          },
        },
        version: 0,
      }),
    );

    await useWorkoutStore.persist.rehydrate();

    expect(draft()?.customExercises).toEqual([]);
    expect(draft()?.title).toBe('Viejo');
  });
});

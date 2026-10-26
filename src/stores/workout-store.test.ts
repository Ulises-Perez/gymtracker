import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { indexedDbStorage } from '../lib/storage.ts';
import { saveWorkoutVariablesSchema } from '../schemas/workout.ts';
import { toSaveWorkoutPayload } from '../lib/workout-payload.ts';
import { findWorkoutNumberProblem, WORKOUT_STORAGE_KEY, useWorkoutStore } from './workout-store.ts';

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

/**
 * The gate that keeps a session the save contract would refuse from being frozen.
 *
 * `finish()` is what writes `endedAt`, and a finished draft can no longer be edited — so a draft that
 * holds a value the contract refuses cannot be repaired once it is frozen: the only two ways out
 * would be retrying the same invalid payload or throwing the session away. The rule that decides is
 * the contract's own, so the store cannot disagree with the schema.
 */
describe('refusing to freeze a draft the contract would refuse', () => {
  beforeEach(() => {
    store().start();
    store().addExercise(EXERCISE_ID);
  });

  function cardId(): string {
    return draft()?.exercises[0]?.id ?? '';
  }

  function setId(): string {
    return draft()?.exercises[0]?.sets[0]?.id ?? '';
  }

  it('keeps the workout open when a set holds fractional reps', () => {
    store().addSet(cardId(), { reps: 10.5, weightKg: 100 });

    store().finish();

    expect(draft()?.status).toBe('draft');
    expect(draft()?.endedAt).toBeNull();
  });

  it('keeps the workout open when a set holds a negative weight', () => {
    store().addSet(cardId(), { reps: 10, weightKg: -5 });

    store().finish();

    expect(draft()?.status).toBe('draft');
  });

  /**
   * The other half, and the reason the gate is not a wall: a draft is only held open while it holds
   * something the contract refuses. Once the value is corrected, the same tap finishes the workout.
   */
  it('finishes once the value is corrected', () => {
    store().addSet(cardId(), { reps: 10.5, weightKg: 100 });
    store().finish();

    store().updateSet(cardId(), setId(), { reps: 10 });
    store().finish();

    expect(draft()?.status).toBe('finished');
    expect(draft()?.endedAt).toEqual(expect.any(Number));
  });
});

/**
 * The search the finish gate runs, and the reason it names the field instead of saying "no".
 *
 * A message that does not say where to look turns a session one correction away from being saved into
 * a puzzle, so what is asserted is the card, the row and the rule's own words.
 */
describe('finding the number that keeps a draft open', () => {
  beforeEach(() => {
    store().start();
    store().addExercise(EXERCISE_ID);
    store().addExercise(OTHER_EXERCISE_ID);
  });

  function cardId(position: number): string {
    return draft()?.exercises[position]?.id ?? '';
  }

  function problemInCurrentDraft() {
    const current = draft();

    if (!current) {
      throw new Error('expected an open draft');
    }

    return findWorkoutNumberProblem(current);
  }

  it('finds nothing in a draft the contract takes', () => {
    store().addSet(cardId(0), { reps: 5, weightKg: 100 });
    store().addSet(cardId(1), { reps: 10, weightKg: 80 });

    expect(problemInCurrentDraft()).toBeNull();
  });

  it('names the card, the position of the set and the rule it breaks', () => {
    store().addSet(cardId(1), { reps: 10.5, weightKg: 100 });

    expect(problemInCurrentDraft()).toEqual({
      exerciseId: OTHER_EXERCISE_ID,
      setNumber: 1,
      field: 'reps',
      refusal: 'Las reps tienen que ser un número entero entre 1 y 1000.',
    });
  });

  /**
   * The card has no objective row anymore, so the search has no objective to name: everything it
   * reports is a series, and the number it gives is that series' position.
   */
  it('names a series and never an objective', () => {
    store().addSet(cardId(0), { reps: 10, weightKg: -20 });

    const problem = problemInCurrentDraft();

    expect(problem?.setNumber).toBe(1);
    expect(problem?.field).toBe('weightKg');
    expect(problem?.exerciseId).toBe(EXERCISE_ID);
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
    expect(persisted).toEqual({ state: { draft: expect.any(Object) }, version: 4 });
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

/**
 * The objective that left the card.
 *
 * The card used to open with a row of three optional fields: the reps it aimed for and the range of
 * weights, between a minimum and a maximum. What the card shows now is the series — the reps and
 * the kilos actually lifted. The objective is not a smaller thing to hide, it is a different thing:
 * a session is a record of what was lifted, and a target nobody lifted is not part of it.
 */
describe('the objective that left the card', () => {
  it('keeps no objective in the draft', () => {
    store().start();
    store().addExercise(EXERCISE_ID);

    const card = draft()?.exercises[0];

    expect(card).not.toHaveProperty('targetReps');
    expect(card).not.toHaveProperty('targetWeightMin');
    expect(card).not.toHaveProperty('targetWeightMax');
  });

  /**
   * A draft written by the previous build carries the objective the card no longer asks for, and it
   * may carry one the save contract would refuse. With the fields gone there is no way to correct
   * it, and a session frozen over a number nobody can fix is exactly the defect the contract was
   * written to kill. So the objective is dropped on the way in, and the series are what survive.
   */
  it('drops the inherited objective and keeps the series', async () => {
    await indexedDbStorage.setItem(
      WORKOUT_STORAGE_KEY,
      JSON.stringify({
        state: {
          draft: {
            workoutId: '01920000-0000-7000-8000-0000000000fe',
            date: '2026-10-01',
            title: 'Viejo',
            notes: '',
            startedAt: 1,
            endedAt: null,
            status: 'draft',
            customExercises: [],
            exercises: [
              {
                id: 'card-vieja',
                exerciseId: EXERCISE_ID,
                sets: [
                  {
                    id: 'set-vieja',
                    reps: 10,
                    weightKg: 60,
                    rpe: null,
                    isWarmup: false,
                    notes: null,
                  },
                ],
                // The objective the previous build asked for, one of them the contract refuses.
                targetReps: 0,
                targetWeightMin: 60,
                targetWeightMax: 80,
              },
            ],
          },
        },
        version: 2,
      }),
    );

    await useWorkoutStore.persist.rehydrate();

    const card = draft()?.exercises[0];

    expect(card).not.toHaveProperty('targetReps');
    expect(card).not.toHaveProperty('targetWeightMin');
    expect(card).not.toHaveProperty('targetWeightMax');

    // The series are the session: they survive the migration untouched.
    expect(card?.sets).toEqual([
      {
        id: 'set-vieja',
        reps: 10,
        weightKg: 60,
        rpe: null,
        isWarmup: false,
        notes: null,
      },
    ]);

    // And the objective the contract would have refused cannot freeze the session.
    const restored = draft();

    if (!restored) {
      throw new Error('the draft was not restored');
    }

    expect(findWorkoutNumberProblem(restored)).toBeNull();
  });
});

/**
 * A session the old build froze over a number the save contract refuses.
 *
 * The old build let the card take a fractional rep, the contract refused it at the save, and the
 * draft stayed frozen: a frozen draft takes no more edits, so the only way out was to throw the
 * session away. The rule now lives in the card, which refuses the number at the keystroke — but a
 * draft written before that rule existed can still carry one, and the session it belongs to is
 * still unsavable. So the rule is applied on the way in, the same way the card applies it: **a
 * value the contract refuses is not written down.** What survives is the rest of the session, which
 * is the part nobody can rewrite.
 */
describe('a session frozen by an older build', () => {
  it('drops the number the contract refuses, so the session can be saved again', async () => {
    await indexedDbStorage.setItem(
      WORKOUT_STORAGE_KEY,
      JSON.stringify({
        state: {
          draft: {
            workoutId: '01920000-0000-7000-8000-0000000000ff',
            date: '2026-10-01',
            title: 'Empuje',
            notes: '',
            startedAt: 1,
            endedAt: 2,
            // Frozen: this is what the old build left behind when the save failed.
            status: 'finished',
            customExercises: [],
            exercises: [
              {
                id: 'card-vieja',
                exerciseId: EXERCISE_ID,
                sets: [
                  {
                    id: '01920000-0000-7000-8000-0000000000b1',
                    reps: 10.5,
                    weightKg: 60,
                    rpe: null,
                    isWarmup: false,
                    notes: null,
                  },
                  {
                    id: '01920000-0000-7000-8000-0000000000b2',
                    reps: 10,
                    weightKg: 80,
                    rpe: null,
                    isWarmup: false,
                    notes: null,
                  },
                ],
                targetReps: 0,
                targetWeightMin: 60,
                targetWeightMax: 80,
              },
            ],
          },
        },
        version: 2,
      }),
    );

    await useWorkoutStore.persist.rehydrate();

    const restored = draft();

    if (!restored) {
      throw new Error('the draft was not restored');
    }

    // The refused number is not written down, and the rest of the series is untouched.
    expect(restored.exercises[0]?.sets[0]?.reps).toBeNull();
    expect(restored.exercises[0]?.sets[0]?.weightKg).toBe(60);
    expect(restored.exercises[0]?.sets[1]?.reps).toBe(10);
    expect(restored.exercises[0]?.sets[1]?.weightKg).toBe(80);

    // And the session is savable: the payload of the restored draft is one the contract accepts.
    const variables = {
      kind: 'save-workout' as const,
      ownerId: '00000000-0000-4000-a000-000000000001',
      payload: toSaveWorkoutPayload(restored),
    };

    expect(saveWorkoutVariablesSchema.safeParse(variables).success).toBe(true);
  });

  /**
   * The rule has to reach a draft written by **any** build, not only by one whose version
   * differs from the store's: zustand runs the migration only on a version change, so a draft
   * persisted at the current version would keep the refused number for ever. The version is bumped
   * with the rule for exactly that reason — the rule changed, so the format changed with it.
   */
  it('repairs a draft persisted at the version the rule changed in', async () => {
    await indexedDbStorage.setItem(
      WORKOUT_STORAGE_KEY,
      JSON.stringify({
        state: {
          draft: {
            workoutId: '01920000-0000-7000-8000-0000000000fe',
            date: '2026-10-01',
            title: 'Empuje',
            notes: '',
            startedAt: 1,
            endedAt: 2,
            status: 'finished',
            customExercises: [],
            exercises: [
              {
                id: 'card-vieja',
                exerciseId: EXERCISE_ID,
                sets: [
                  {
                    id: '01920000-0000-7000-8000-0000000000b1',
                    reps: 10.5,
                    weightKg: 60,
                    rpe: null,
                    isWarmup: false,
                    notes: null,
                  },
                ],
              },
            ],
          },
        },
        // The version the build that froze the session persisted at.
        version: 3,
      }),
    );

    await useWorkoutStore.persist.rehydrate();

    const restored = draft();

    if (!restored) {
      throw new Error('the draft was not restored');
    }

    expect(restored.exercises[0]?.sets[0]?.reps).toBeNull();

    const variables = {
      kind: 'save-workout' as const,
      ownerId: '00000000-0000-4000-a000-000000000001',
      payload: toSaveWorkoutPayload(restored),
    };

    expect(saveWorkoutVariablesSchema.safeParse(variables).success).toBe(true);
  });
});

describe('repeating a stored workout', () => {
  const SOURCE = {
    title: 'Empuje',
    exercises: [{ exerciseId: EXERCISE_ID }, { exerciseId: OTHER_EXERCISE_ID }],
  };

  /**
   * The shape of a repeated session, in one assertion: a brand-new draft, the stored cards in their
   * stored order, and no sets at all. The load comes from the history later, which is where a gym
   * wants it. The objective of the session being repeated is not carried: it is not a number
   * anybody lifted, and the card has nowhere to show it.
   */
  it('opens a new draft with the stored cards in order and no sets', () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date(2026, 9, 20, 15, 0, 0));

      store().repeatFrom(SOURCE);

      expect(draft()?.status).toBe('draft');
      expect(draft()?.endedAt).toBeNull();
      // A repeated session is a new one, born today and not on the day it was copied from.
      expect(draft()?.date).toBe('2026-10-20');
      expect(draft()?.workoutId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
      // Order is the point: the same session, in the sequence it was trained in.
      expect(draft()?.exercises.map((card) => card.exerciseId)).toEqual([
        EXERCISE_ID,
        OTHER_EXERCISE_ID,
      ]);
      expect(draft()?.exercises.map((card) => card.sets)).toEqual([[], []]);
      expect(draft()?.exercises[0]).not.toHaveProperty('targetReps');
      expect(draft()?.exercises[1]).not.toHaveProperty('targetReps');
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The title names the session being repeated; the notes are a comment about *that* day, and
   * carrying them over would put yesterday's words on today's workout.
   */
  it('copies the title and leaves the notes behind', () => {
    store().start();
    store().setTitle('Viejo');
    store().setNotes('Comentario de aquel día');

    store().repeatFrom(SOURCE);

    expect(draft()?.title).toBe('Empuje');
    expect(draft()?.notes).toBe('');
  });

  /**
   * Reading the device is asynchronous, so until it finishes the store does not know whether a
   * session is on disk. Opening one on that guess is exactly the silent overwrite the guard exists
   * to make impossible — and the guard lives here, not in a screen, because it protects every caller.
   */
  it('refuses to open a draft before the stored one has been read', () => {
    useWorkoutStore.setState({ draft: null, hydrated: false });

    store().repeatFrom(SOURCE);

    expect(draft()).toBeNull();
    expect(store().hydrated).toBe(false);
  });
});

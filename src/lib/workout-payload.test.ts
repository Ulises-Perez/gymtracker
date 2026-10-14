import { describe, expect, it } from 'vitest';

import { saveWorkoutPayloadSchema } from '../schemas/workout.ts';
import type {
  WorkoutDraft,
  WorkoutExerciseDraft,
  WorkoutSetDraft,
} from '../stores/workout-store.ts';
import { toSaveWorkoutPayload } from './workout-payload.ts';

/**
 * The mapping from what is on the device to what `save_workout` reads.
 *
 * It is one function and it is worth a file of its own, because every mistake here
 * is a silent corruption rather than a crash: a set numbered from zero, a duration
 * counted from the wrong end, a row the user never filled arriving as a set they
 * performed. The server does no filtering of its own — it deletes the workout's sets
 * and writes whatever the array contains.
 */

const WORKOUT_ID = '01920000-0000-7000-8000-000000000001';
const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';
const PRESS_INCLINADO = '01920000-0000-7000-8000-0000000000a2';
const STARTED = Date.UTC(2026, 9, 13, 18, 0, 0);

function set(overrides: Partial<WorkoutSetDraft> = {}): WorkoutSetDraft {
  return {
    id: '01920000-0000-7000-8000-0000000000b1',
    reps: 5,
    weightKg: 100,
    rpe: null,
    isWarmup: false,
    notes: null,
    ...overrides,
  };
}

function card(overrides: Partial<WorkoutExerciseDraft> = {}): WorkoutExerciseDraft {
  return {
    id: '01920000-0000-7000-8000-0000000000c1',
    exerciseId: PRESS_BANCA,
    sets: [set()],
    targetReps: null,
    targetWeightMin: null,
    targetWeightMax: null,
    ...overrides,
  };
}

function draft(overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    workoutId: WORKOUT_ID,
    date: '2026-10-13',
    title: 'Empuje',
    notes: '',
    startedAt: STARTED,
    endedAt: STARTED + 52 * 60_000,
    status: 'finished',
    exercises: [card()],
    customExercises: [],
    ...overrides,
  };
}

describe('toSaveWorkoutPayload', () => {
  it('carries the identity and the date the draft fixed, not the ones the server would pick', () => {
    const payload = toSaveWorkoutPayload(draft());

    // The RPC would fill both in, and both defaults are wrong for a queue: a write
    // made yesterday and resumed today would move to today, and a fresh id on every
    // retry is exactly the duplication the client-owned id exists to prevent.
    expect(payload.id).toBe(WORKOUT_ID);
    expect(payload.date).toBe('2026-10-13');
  });

  it('measures the session from the timestamps the draft recorded', () => {
    expect(toSaveWorkoutPayload(draft()).duration_minutes).toBe(52);
  });

  it('has no duration while the workout is still open', () => {
    expect(toSaveWorkoutPayload(draft({ endedAt: null })).duration_minutes).toBeNull();
  });

  /**
   * The SQL only guards `title`, and only against the empty string: `NULLIF(...)` turns
   * `''` into null but leaves `'   '` alone. So a title of spaces would be stored as
   * spaces, and `notes` has no guard at all — an untouched field would land as `''`
   * rather than as "nothing was written".
   */
  it('sends blank text as nothing instead of as whitespace', () => {
    const payload = toSaveWorkoutPayload(draft({ title: '   ', notes: '  \n ' }));

    expect(payload.title).toBeNull();
    expect(payload.notes).toBeNull();
  });

  it('trims the text that is not blank', () => {
    const payload = toSaveWorkoutPayload(draft({ title: '  Empuje  ', notes: '  costó  ' }));

    expect(payload.title).toBe('Empuje');
    expect(payload.notes).toBe('costó');
  });

  it('numbers the sets of each card from one', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({
            sets: [set({ id: '01920000-0000-7000-8000-0000000000d1' })],
          }),
        ],
      }),
    );

    expect(payload.sets.map((entry) => entry.set_number)).toEqual([1]);
  });

  /**
   * The same exercise twice in one session is a legitimate thing to log, and the two
   * cards are two blocks of sets. Nothing in the schema forbids it — there is no unique
   * constraint on `(workout_id, exercise_id, set_number)` — so the numbering restarting
   * per card is what keeps the two blocks readable instead of running 1, 2, 3, 4.
   */
  it('restarts the numbering when the same exercise appears in a second card', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({
            id: '01920000-0000-7000-8000-0000000000c1',
            sets: [
              set({ id: '01920000-0000-7000-8000-0000000000d1' }),
              set({ id: '01920000-0000-7000-8000-0000000000d2' }),
            ],
          }),
          card({
            id: '01920000-0000-7000-8000-0000000000c2',
            sets: [
              set({ id: '01920000-0000-7000-8000-0000000000d3' }),
              set({ id: '01920000-0000-7000-8000-0000000000d4' }),
            ],
          }),
        ],
      }),
    );

    expect(payload.sets.map((entry) => entry.set_number)).toEqual([1, 2, 1, 2]);
    expect(payload.sets.map((entry) => entry.exercise_id)).toEqual([
      PRESS_BANCA,
      PRESS_BANCA,
      PRESS_BANCA,
      PRESS_BANCA,
    ]);
  });

  /**
   * `[+ serie]` adds an empty row, and the RPC writes whatever the array holds: it
   * neither skips nulls nor counts them. A row the user never touched would otherwise
   * be stored as a set they performed, and it would show up in the history and in the
   * volume of the session.
   */
  it('leaves out a set that was never filled in', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({
            sets: [
              set({ id: '01920000-0000-7000-8000-0000000000d1' }),
              set({
                id: '01920000-0000-7000-8000-0000000000d2',
                reps: null,
                weightKg: null,
              }),
            ],
          }),
        ],
      }),
    );

    expect(payload.sets.map((entry) => entry.id)).toEqual(['01920000-0000-7000-8000-0000000000d1']);
  });

  /**
   * Half a set is still a set. Someone who wrote the reps and left the weight for later
   * recorded a set, and dropping it would lose the one thing they typed.
   */
  it('keeps a set where only the reps were written', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({
            sets: [set({ id: '01920000-0000-7000-8000-0000000000d1', reps: 8, weightKg: null })],
          }),
        ],
      }),
    );

    expect(payload.sets).toHaveLength(1);
    expect(payload.sets[0]?.reps).toBe(8);
    expect(payload.sets[0]?.weight_kg).toBeNull();
  });

  it('keeps the per-set flags and notes the user chose', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({
            sets: [set({ isWarmup: true, rpe: 7.5, notes: 'última con ayuda' })],
          }),
        ],
      }),
    );

    expect(payload.sets[0]?.is_warmup).toBe(true);
    expect(payload.sets[0]?.rpe).toBe(7.5);
    expect(payload.sets[0]?.notes).toBe('última con ayuda');
  });
});

describe('the custom exercises the payload carries', () => {
  const CUSTOM_ID = '01920000-0000-7000-8000-0000000000e1';
  const CUSTOM = { id: CUSTOM_ID, name: 'Press con banda', muscleGroupId: null };

  /**
   * The custom definition travels with the payload because the row does not exist on
   * the server yet, and `workout_sets.exercise_id` is a foreign key: without it, the
   * whole workout cannot be written (migration 0008).
   */
  it('carries the one the saved sets reference', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [card({ exerciseId: CUSTOM_ID })],
        customExercises: [CUSTOM],
      }),
    );

    expect(payload.custom_exercises).toEqual([
      { id: CUSTOM_ID, name: 'Press con banda', muscle_group_id: null },
    ]);
  });

  it('carries its muscle group when it has one', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [card({ exerciseId: CUSTOM_ID })],
        customExercises: [{ ...CUSTOM, muscleGroupId: '01920000-0000-7000-8000-000000000020' }],
      }),
    );

    expect(payload.custom_exercises?.[0]?.muscle_group_id).toBe(
      '01920000-0000-7000-8000-000000000020',
    );
  });

  /**
   * Deleting the card does not delete the definition from the draft, and a definition
   * with no sets is not referenced by anything the server will write. Sending it would
   * create an exercise in the catalogue that the user never trained with — a row they
   * cannot delete from the app.
   */
  it('leaves out a definition whose card was removed before saving', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [card({ exerciseId: PRESS_INCLINADO })],
        customExercises: [CUSTOM],
      }),
    );

    expect(payload.custom_exercises).toEqual([]);
  });

  it('leaves out a definition whose sets were all left empty', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [card({ exerciseId: CUSTOM_ID, sets: [set({ reps: null, weightKg: null })] })],
        customExercises: [CUSTOM],
      }),
    );

    expect(payload.custom_exercises).toEqual([]);
  });
});

describe('the targets the payload carries', () => {
  it('carries the target of the card that has one', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [card({ targetReps: 10, targetWeightMin: 60, targetWeightMax: 80 })],
      }),
    );

    expect(payload.exercise_targets).toEqual([
      {
        exercise_id: PRESS_BANCA,
        position: 1,
        target_reps: 10,
        target_weight_min: 60,
        target_weight_max: 80,
      },
    ]);
  });

  /**
   * An all-empty target is not a target: it is a card the user never got around to. Sending it
   * would put a row in the database that says nothing.
   */
  it('leaves out a card that has no target at all', () => {
    const payload = toSaveWorkoutPayload(draft({ exercises: [card()] }));

    expect(payload.exercise_targets).toEqual([]);
  });

  it('sends a half-written target with nulls for the rest', () => {
    const payload = toSaveWorkoutPayload(draft({ exercises: [card({ targetReps: 8 })] }));

    expect(payload.exercise_targets?.[0]).toEqual({
      exercise_id: PRESS_BANCA,
      position: 1,
      target_reps: 8,
      target_weight_min: null,
      target_weight_max: null,
    });
  });

  /**
   * The position is the card's place in the session, not its place among the targets. The second
   * card is the only one with a target here and it still has to be 2 — filing it as 1 would put the
   * target against the wrong exercise the day the same exercise appears twice, which is the whole
   * reason the database key carries a position.
   */
  it('numbers the target by the card, not by how many cards have one', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({ id: 'card-1', exerciseId: PRESS_INCLINADO }),
          card({ id: 'card-2', exerciseId: PRESS_BANCA, targetReps: 5 }),
        ],
      }),
    );

    expect(payload.exercise_targets?.[0]).toMatchObject({
      exercise_id: PRESS_BANCA,
      position: 2,
    });
  });
});

/**
 * The strongest thing that can be said about the mapping without a database: the
 * payload it produces is one the contract accepts. `saveWorkout` parses inside the
 * deferred chunk, so a mismatch here would surface as a failed write at the worst
 * possible moment — after the user has finished their session.
 */
describe('the payload it builds is one the contract accepts', () => {
  it('parses for a full session, custom exercise included', () => {
    const payload = toSaveWorkoutPayload(
      draft({
        exercises: [
          card({
            sets: [
              set({
                id: '01920000-0000-7000-8000-0000000000d1',
                isWarmup: true,
                weightKg: 40,
                reps: 10,
              }),
              set({ id: '01920000-0000-7000-8000-0000000000d2', reps: null, weightKg: 120 }),
            ],
          }),
          card({
            id: '01920000-0000-7000-8000-0000000000c2',
            exerciseId: '01920000-0000-7000-8000-0000000000e1',
            sets: [set({ id: '01920000-0000-7000-8000-0000000000d3' })],
          }),
        ],
        customExercises: [
          {
            id: '01920000-0000-7000-8000-0000000000e1',
            name: 'Press con banda',
            muscleGroupId: null,
          },
        ],
      }),
    );

    const parsed = saveWorkoutPayloadSchema.safeParse(payload);

    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('parses for a session with no sets at all', () => {
    // Starting a workout and finishing it without logging anything is odd but legal,
    // and the RPC loops over an empty array without complaining.
    const payload = toSaveWorkoutPayload(draft({ exercises: [] }));

    expect(saveWorkoutPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

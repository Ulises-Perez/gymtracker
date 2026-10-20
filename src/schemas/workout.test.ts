import { describe, expect, it } from 'vitest';

import { workoutNumberRefusal } from '../lib/utils.ts';
import { saveWorkoutPayloadSchema } from './workout.ts';

/**
 * The payload contract that `save_workout` reads.
 *
 * The generated `Database` type sees this argument as opaque `Json`, so this
 * schema is the only thing holding the client and the SQL together, and the cases
 * below are the ones where they can drift apart silently.
 */
const basePayload = {
  id: '01920000-0000-7000-8000-000000000001',
  date: '2026-10-13',
  sets: [],
};

describe('saveWorkoutPayloadSchema', () => {
  it('accepts a payload with no custom exercises at all', () => {
    // The key is optional on purpose: 0008 reads it with a COALESCE, so a payload
    // written before custom exercises existed has to keep working.
    expect(saveWorkoutPayloadSchema.safeParse(basePayload).success).toBe(true);
  });

  it('accepts the custom exercises the draft created offline', () => {
    const result = saveWorkoutPayloadSchema.safeParse({
      ...basePayload,
      custom_exercises: [
        {
          id: '01920000-0000-7000-8000-0000000000aa',
          name: 'Press con banda',
          muscle_group_id: null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  /**
   * `null` is rejected rather than tolerated, and that is not pedantry: the SQL
   * reads the key with `payload->'custom_exercises'`, and a JSON `null` comes back
   * as JSON null — `COALESCE` does not replace it — so `jsonb_array_elements` would
   * be handed a null. The schema is the only place that can stop it.
   */
  it('rejects a null in place of the array', () => {
    const result = saveWorkoutPayloadSchema.safeParse({ ...basePayload, custom_exercises: null });

    expect(result.success).toBe(false);
  });

  it('rejects a custom exercise with no name', () => {
    // 0008 refuses it too, with a message meant for a person; the schema refuses it
    // before the request is ever sent, which is the cheaper place to be told.
    const result = saveWorkoutPayloadSchema.safeParse({
      ...basePayload,
      custom_exercises: [{ id: '01920000-0000-7000-8000-0000000000aa', name: '   ' }],
    });

    expect(result.success).toBe(false);
  });

  it('accepts the targets a session sets for itself', () => {
    const result = saveWorkoutPayloadSchema.safeParse({
      ...basePayload,
      exercise_targets: [
        {
          exercise_id: '01920000-0000-7000-8000-0000000000aa',
          position: 1,
          target_reps: 10,
          target_weight_min: 60,
          target_weight_max: 80,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  /**
   * The position is what tells two cards of the same exercise apart in the database (0009), so a
   * target without one cannot be stored at all. Refusing it here means the failure names a field
   * instead of arriving as the RPC's message about a position.
   */
  it('rejects a target with no position', () => {
    const result = saveWorkoutPayloadSchema.safeParse({
      ...basePayload,
      exercise_targets: [{ exercise_id: '01920000-0000-7000-8000-0000000000aa', target_reps: 10 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a null in place of the targets array', () => {
    // Same reason as `custom_exercises`: 0009 reads the key with a COALESCE and a JSON null
    // survives it, so `jsonb_array_elements` would be handed a null.
    const result = saveWorkoutPayloadSchema.safeParse({
      ...basePayload,
      exercise_targets: null,
    });

    expect(result.success).toBe(false);
  });
});

/**
 * The modern payload, which is what this build writes (migration 0012).
 *
 * The card is the entity: the exercise, what the session aimed for, and its sets **inside**. The
 * array order is the card order, so there is no `position` field to send — 0012 numbers the
 * position from the array, and asking for it twice would only create a second way for the two to
 * disagree. The legacy flat shape above stays accepted because a write queued offline before this
 * deploy still has it, and refusing it would lose that workout for ever.
 */
const modernPayload = {
  id: '01920000-0000-7000-8000-000000000001',
  date: '2026-10-13',
  exercises: [
    {
      exercise_id: '01920000-0000-7000-8000-0000000000aa',
      target_reps: 8,
      target_weight_min: 60,
      target_weight_max: 80,
      sets: [
        {
          id: '01920000-0000-7000-8000-0000000000bb',
          set_number: 1,
          reps: 5,
          weight_kg: 100,
          rpe: null,
          is_warmup: false,
          notes: null,
        },
      ],
    },
  ],
};

describe('the modern payload shape', () => {
  it('accepts a card that carries its own sets and its own target', () => {
    expect(saveWorkoutPayloadSchema.safeParse(modernPayload).success).toBe(true);
  });

  it('accepts a card with no sets and no target, because a card the user added is real', () => {
    const result = saveWorkoutPayloadSchema.safeParse({
      ...modernPayload,
      exercises: [
        {
          exercise_id: '01920000-0000-7000-8000-0000000000aa',
          target_reps: null,
          target_weight_min: null,
          target_weight_max: null,
          sets: [],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  /**
   * One shape or the other, never neither. A payload with no cards and no flat sets would write an
   * empty workout — the old schema refused it by requiring `sets`, and that refusal has to survive
   * the second shape being accepted.
   */
  it('rejects a payload that carries neither shape', () => {
    const result = saveWorkoutPayloadSchema.safeParse({
      id: '01920000-0000-7000-8000-000000000001',
      date: '2026-10-13',
    });

    expect(result.success).toBe(false);
  });
});

const CARD_EXERCISE_ID = '01920000-0000-7000-8000-0000000000aa';

/** A modern payload whose one card holds a single set, with the named fields overridden. */
function modernPayloadWithSet(set: Record<string, unknown>) {
  return {
    ...modernPayload,
    exercises: [
      {
        exercise_id: CARD_EXERCISE_ID,
        target_reps: null,
        target_weight_min: null,
        target_weight_max: null,
        sets: [
          {
            id: '01920000-0000-7000-8000-0000000000bb',
            set_number: 1,
            rpe: null,
            is_warmup: false,
            notes: null,
            ...set,
          },
        ],
      },
    ],
  };
}

/** A modern payload whose one card carries a target and no sets. */
function modernPayloadWithTarget(target: Record<string, unknown>) {
  return {
    ...modernPayload,
    exercises: [{ exercise_id: CARD_EXERCISE_ID, sets: [], ...target }],
  };
}

/**
 * The two numbers the contract scores, which are the two the fields let someone type.
 *
 * `reps` is an integer in an `INT` column and a weight is a `DECIMAL` that cannot be negative, so a
 * value outside those bounds is not a session anyone performed. The field and the finish gate have
 * to refuse it before the save does: once the draft is finished and the payload is refused, the
 * session can only be retried with the same invalid payload or thrown away.
 */
describe('the numbers a set or a target may hold', () => {
  it('refuses reps that are not a whole number', () => {
    const result = saveWorkoutPayloadSchema.safeParse(
      modernPayloadWithSet({ reps: 10.5, weight_kg: 100 }),
    );

    expect(result.success).toBe(false);
  });

  it('refuses reps of zero', () => {
    const result = saveWorkoutPayloadSchema.safeParse(
      modernPayloadWithSet({ reps: 0, weight_kg: 100 }),
    );

    expect(result.success).toBe(false);
  });

  it('refuses a negative weight', () => {
    const result = saveWorkoutPayloadSchema.safeParse(
      modernPayloadWithSet({ reps: 5, weight_kg: -5 }),
    );

    expect(result.success).toBe(false);
  });

  /** A weight is a decimal, so the comma in "72,5" is still a value the session can hold. */
  it('accepts a decimal weight', () => {
    const result = saveWorkoutPayloadSchema.safeParse(
      modernPayloadWithSet({ reps: 5, weight_kg: 72.5 }),
    );

    expect(result.success).toBe(true);
  });

  it('refuses a target of fractional reps', () => {
    const result = saveWorkoutPayloadSchema.safeParse(
      modernPayloadWithTarget({ target_reps: 8.5 }),
    );

    expect(result.success).toBe(false);
  });

  it('refuses a negative target weight', () => {
    const result = saveWorkoutPayloadSchema.safeParse(
      modernPayloadWithTarget({ target_weight_min: -20 }),
    );

    expect(result.success).toBe(false);
  });
});

/**
 * The contract is *derived* from the rule the fields use, and this is what says so.
 *
 * Two hand-written copies of "an integer greater than zero" used to be one copy too many: the fields
 * took a value the payload refused, so a session could be typed, finished, frozen and only then
 * rejected — with a retry that re-sent the same refused bytes and a discard as the only way out.
 * Neither the values nor the messages are asserted twice here; what is asserted is that the contract
 * and the rule answer the same question the same way, for every value either of them can see.
 */
describe('the rule the fields use, and the contract', () => {
  const values: Array<number | null | undefined> = [null, undefined, 0, 1, 5, 10.5, -1, -0.5, 72.5];

  it('agrees on every reps value', () => {
    for (const reps of values) {
      const accepted = saveWorkoutPayloadSchema.safeParse(
        modernPayloadWithSet({ reps, weight_kg: null }),
      ).success;

      expect({ reps, accepted }).toEqual({
        reps,
        accepted: workoutNumberRefusal('reps', reps) === null,
      });
    }
  });

  it('agrees on every weight value', () => {
    for (const weight of values) {
      const accepted = saveWorkoutPayloadSchema.safeParse(
        modernPayloadWithSet({ reps: null, weight_kg: weight }),
      ).success;

      expect({ weight, accepted }).toEqual({
        weight,
        accepted: workoutNumberRefusal('weightKg', weight) === null,
      });
    }
  });
});

/**
 * The shape a queued write from before 0012 still carries.
 *
 * `saveWorkoutVariablesSchema` is parsed again on **every** retry, including the retry of a mutation
 * restored from IndexedDB — so a payload an older build queued offline has to keep parsing. If it
 * stopped, that entry would fail the client's own validation for ever and the workout would be lost
 * without the server ever hearing about it; 0012 keeps its own compatibility branch for the same
 * reason. The optional keys are the interesting ones: an old build wrote `exercise_targets` only
 * when someone had actually set a target.
 */
describe('the legacy payload a queued write still carries', () => {
  const legacySet = {
    id: '01920000-0000-7000-8000-0000000000bb',
    exercise_id: '01920000-0000-7000-8000-0000000000aa',
    set_number: 1,
    reps: 5,
    weight_kg: 100,
    rpe: null,
    is_warmup: false,
    notes: null,
  };

  const legacy = () => ({
    id: '01920000-0000-7000-8000-000000000001',
    date: '2026-10-12',
    sets: [legacySet],
  });

  it('parses flat sets with neither optional key present', () => {
    expect(saveWorkoutPayloadSchema.safeParse(legacy()).success).toBe(true);
  });

  it('parses legacy targets and custom exercises together', () => {
    const result = saveWorkoutPayloadSchema.safeParse({
      ...legacy(),
      exercise_targets: [
        {
          exercise_id: '01920000-0000-7000-8000-0000000000aa',
          position: 1,
          target_reps: null,
          target_weight_min: null,
          target_weight_max: null,
        },
      ],
      custom_exercises: [
        {
          id: '01920000-0000-7000-8000-0000000000cc',
          name: 'Press con banda',
          muscle_group_id: null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('parses a half-written set, which is what an old build wrote for a row left empty', () => {
    const { sets, ...rest } = legacy();

    expect(sets).toHaveLength(1);

    const result = saveWorkoutPayloadSchema.safeParse({
      ...rest,
      sets: [{ ...legacySet, reps: null, weight_kg: null }],
    });

    expect(result.success).toBe(true);
  });
});

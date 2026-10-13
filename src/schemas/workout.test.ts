import { describe, expect, it } from 'vitest';

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
});

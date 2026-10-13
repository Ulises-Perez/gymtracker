import { z } from 'zod';

/**
 * Contract of the `save_workout(payload jsonb)` RPC, in `src/lib`.
 *
 * The generated `Database` type sees this argument as opaque `Json`, so it is
 * this schema — not the generated types — that holds the client and the SQL
 * together. Keys stay snake_case because they are the names the RPC reads
 * (`payload->>'duration_minutes'`): matching them exactly keeps one contract
 * instead of a mapping layer that can drift away from the SQL.
 *
 * A note on numbers: `numeric` columns reach the client as strings (A5), but the
 * values inside this RPC's `jsonb` are JSON numbers. `z.coerce.number()` accepts
 * either, and `nullish()` checks for `null` before it coerces, so a first-ever PR
 * (where `old_1rm` is genuinely null) stays null instead of becoming 0.
 */

export const workoutSetPayloadSchema = z.object({
  id: z.uuid(),
  exercise_id: z.uuid(),
  set_number: z.number().int().positive(),
  reps: z.number().int().positive().nullish(),
  weight_kg: z.number().nonnegative().nullish(),
  rpe: z.number().min(1).max(10).nullish(),
  is_warmup: z.boolean(),
  notes: z.string().nullish(),
});

/**
 * `id` and `date` are required, and that is the interesting part of this schema.
 *
 * The RPC would happily fill both in — `gen_random_uuid()` and `CURRENT_DATE` —
 * and both defaults are wrong for a queue. A write made offline yesterday and
 * resumed today would be stamped with today's date, so the workout would move;
 * and a generated id is a new workout on every retry, which is exactly the
 * duplication the client-owned id exists to prevent. Requiring them turns those
 * two silent corruptions into a loud parse error.
 */
export const saveWorkoutPayloadSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  title: z.string().nullish(),
  notes: z.string().nullish(),
  duration_minutes: z.number().int().nonnegative().nullish(),
  sets: z.array(workoutSetPayloadSchema),
});

/** A queued `save-workout` entry: the routing `kind` plus the payload. */
export const saveWorkoutVariablesSchema = z.object({
  kind: z.literal('save-workout'),
  payload: saveWorkoutPayloadSchema,
});

export const saveWorkoutResultSchema = z.object({
  workout_id: z.uuid(),
  new_prs: z.array(
    z.object({
      exercise_id: z.uuid(),
      old_1rm: z.coerce.number().nullish(),
      new_1rm: z.coerce.number(),
      weight: z.coerce.number(),
      reps: z.number().int(),
    }),
  ),
});

export type SaveWorkoutPayload = z.infer<typeof saveWorkoutPayloadSchema>;
export type SaveWorkoutVariables = z.infer<typeof saveWorkoutVariablesSchema>;
export type SaveWorkoutResult = z.infer<typeof saveWorkoutResultSchema>;
export type NewPersonalRecord = SaveWorkoutResult['new_prs'][number];

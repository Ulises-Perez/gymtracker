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
 * An exercise the user invented, which only exists on this device until the
 * workout that uses it is saved.
 *
 * It travels with the payload because 0008 creates the row before the sets that
 * reference it: `workout_sets.exercise_id` is a foreign key, so without this the
 * whole workout cannot be written at all.
 */
export const customExercisePayloadSchema = z.object({
  id: z.uuid(),
  // Trimmed first, then required: 0008 refuses a blank name with a message meant
  // for a person, and this refuses it before the request is even sent.
  name: z.string().trim().min(1),
  muscle_group_id: z.uuid().nullish(),
});

/**
 * The target a session sets for an exercise: how many reps, and between which weights.
 *
 * `position` is required, and it is the card's place in the session counted from one. It is what
 * tells two cards of the same exercise apart in the database (migration 0009), so a target without
 * one cannot be stored at all. The other three are optional and independent, because they get typed
 * at different moments and a target that says only "10 reps" is a real target.
 */
export const exerciseTargetPayloadSchema = z.object({
  exercise_id: z.uuid(),
  position: z.number().int().positive(),
  target_reps: z.number().int().positive().nullish(),
  target_weight_min: z.number().nonnegative().nullish(),
  target_weight_max: z.number().nonnegative().nullish(),
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
  /**
   * Optional, and deliberately **not** nullable.
   *
   * Optional because 0008 reads the key with a `COALESCE`, so a payload written
   * before custom exercises existed has to keep working. Not nullable because a
   * JSON `null` survives that `COALESCE` — `->` returns JSON null, which is not SQL
   * NULL — and `jsonb_array_elements` would then be handed a null. This schema is
   * the only place that can stop that from reaching the database.
   */
  custom_exercises: z.array(customExercisePayloadSchema).optional(),
  /**
   * Optional and deliberately **not** nullable, for the same reason as `custom_exercises`: 0009
   * reads the key with a `COALESCE` and a JSON null survives it, so `jsonb_array_elements` would
   * be handed a null.
   */
  exercise_targets: z.array(exerciseTargetPayloadSchema).optional(),
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
export type CustomExercisePayload = z.infer<typeof customExercisePayloadSchema>;
export type ExerciseTargetPayload = z.infer<typeof exerciseTargetPayloadSchema>;
export type SaveWorkoutVariables = z.infer<typeof saveWorkoutVariablesSchema>;
export type SaveWorkoutResult = z.infer<typeof saveWorkoutResultSchema>;
export type NewPersonalRecord = SaveWorkoutResult['new_prs'][number];

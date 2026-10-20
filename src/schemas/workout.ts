import { z } from 'zod';

import { workoutNumberRules } from '../lib/utils.ts';
import type { WorkoutNumberField } from '../lib/utils.ts';

/**
 * Contract of the `save_workout(payload jsonb)` RPC, in `src/lib`.
 *
 * The generated `Database` type sees this argument as opaque `Json`, so it is
 * this schema — not the generated types — that holds the client and the SQL
 * together. Keys stay snake_case because they are the names the RPC reads
 * (`payload->>'duration_minutes'`): matching them exactly keeps one contract
 * instead of a mapping layer that can drift away from the SQL.
 *
 * **The payload has two shapes, and both are accepted.** Not out of courtesy:
 * `saveWorkoutVariablesSchema` parses again on every retry, including the retry of a mutation
 * restored from IndexedDB, and a write queued offline before migration 0012 has the old shape. A
 * schema that stopped accepting it would fail that entry for ever and lose the workout without the
 * server ever hearing about it — which is exactly why 0012 keeps its own compatibility branch.
 *
 * A note on numbers: `numeric` columns reach the client as strings (A5), but the
 * values inside this RPC's `jsonb` are JSON numbers. `z.coerce.number()` accepts
 * either, and `nullish()` checks for `null` before it coerces, so a first-ever PR
 * (where `old_1rm` is genuinely null) stays null instead of becoming 0.
 */

/**
 * A number of a set: `null` when it was not said, and the field's own rule when it was.
 *
 * Written as the shared rule and not as `int().positive()` / `nonnegative()` again, and that is the
 * whole point of the function: the fields guard what is typed with the same table
 * (`workoutNumberRefusal`, in `lib/utils.ts`), so the contract and the input cannot drift apart. When
 * they did, a set typed as "10,5" was accepted by the field, frozen by `finish()` and then refused
 * here on the way to the server — a finished draft with no way out but to lose the session.
 *
 * The rule lives in `lib/utils.ts` rather than here because this module carries Zod, and the store is
 * in the initial bundle: importing the schema to ask the question would put the parser on the first
 * paint. Deriving the schema from the rule keeps one source of truth without that cost.
 */
function optionalWorkoutNumber(field: WorkoutNumberField) {
  const rule = workoutNumberRules[field];

  return z.number().refine(rule.accepts, { message: rule.refuses }).nullish();
}

const repsValueSchema = optionalWorkoutNumber('reps');
const weightKgValueSchema = optionalWorkoutNumber('weightKg');

/**
 * The scored fields of one set, which both shapes carry.
 *
 * The card that a set belongs to is not part of them: in the modern shape the set lives inside its
 * card, and in the legacy one it names its exercise directly. Keeping these fields in one place
 * means the two shapes cannot drift on what a set is.
 */
const workoutSetValuesSchema = z.object({
  id: z.uuid(),
  set_number: z.number().int().positive(),
  reps: repsValueSchema,
  weight_kg: weightKgValueSchema,
  rpe: z.number().min(1).max(10).nullish(),
  is_warmup: z.boolean(),
  notes: z.string().nullish(),
});

/**
 * A set in the legacy flat shape, where every row names its own exercise.
 *
 * Kept because a queued write from before 0012 has this shape, and 0012's own compatibility branch
 * reads `payload->'sets'` with the same `exercise_id`.
 */
export const workoutSetPayloadSchema = workoutSetValuesSchema.extend({
  exercise_id: z.uuid(),
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
 * A card in the modern shape: the exercise, what the session aimed for, and the sets inside.
 *
 * There is no `position` here, and that is deliberate: the array order **is** the card order, so
 * 0012 numbers the position from the array (1..N). Asking the client for it too would only add a
 * second source that can disagree with the first.
 */
export const workoutExercisePayloadSchema = z.object({
  exercise_id: z.uuid(),
  target_reps: repsValueSchema,
  target_weight_min: weightKgValueSchema,
  target_weight_max: weightKgValueSchema,
  sets: z.array(workoutSetValuesSchema),
});

/**
 * The target a session sets for an exercise, in the **legacy** shape.
 *
 * `position` is required there because it is the only signal of order that shape has (0012 sorts the
 * rebuilt cards by it). In the modern shape the target lives on the card and the order comes from
 * the array, so nothing needs a position. The other three fields are optional and independent,
 * because they get typed at different moments and a target that says only "10 reps" is a real
 * target.
 */
export const exerciseTargetPayloadSchema = z.object({
  exercise_id: z.uuid(),
  position: z.number().int().positive(),
  target_reps: repsValueSchema,
  target_weight_min: weightKgValueSchema,
  target_weight_max: weightKgValueSchema,
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
 *
 * The two shapes share these fields, so they are written once.
 */
const payloadIdentityFields = {
  id: z.uuid(),
  date: z.iso.date(),
  title: z.string().nullish(),
  notes: z.string().nullish(),
  duration_minutes: z.number().int().nonnegative().nullish(),
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
};

/** The shape this build writes (migration 0012): cards, in order, with their sets inside. */
export const modernSaveWorkoutPayloadSchema = z.object({
  ...payloadIdentityFields,
  exercises: z.array(workoutExercisePayloadSchema),
});

/** The shape an older build queued: flat sets, and targets with a position. Still accepted. */
export const legacySaveWorkoutPayloadSchema = z.object({
  ...payloadIdentityFields,
  sets: z.array(workoutSetPayloadSchema),
  /**
   * Optional and deliberately **not** nullable, for the same reason as `custom_exercises`: 0009
   * reads the key with a `COALESCE` and a JSON null survives it, so `jsonb_array_elements` would
   * be handed a null.
   */
  exercise_targets: z.array(exerciseTargetPayloadSchema).optional(),
});

/**
 * One shape or the other, and the modern one is tried first.
 *
 * A union and not an object with two optional keys: a payload with neither shape would write an
 * empty workout, and every routed payload has exactly one, so there is no third case to allow.
 * A legacy entry fails the modern member on the missing `exercises` and is then read by the legacy
 * one, which is the whole point of keeping it.
 */
export const saveWorkoutPayloadSchema = z.union([
  modernSaveWorkoutPayloadSchema,
  legacySaveWorkoutPayloadSchema,
]);

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
export type ModernSaveWorkoutPayload = z.infer<typeof modernSaveWorkoutPayloadSchema>;
export type WorkoutExercisePayload = z.infer<typeof workoutExercisePayloadSchema>;
export type CustomExercisePayload = z.infer<typeof customExercisePayloadSchema>;
export type ExerciseTargetPayload = z.infer<typeof exerciseTargetPayloadSchema>;
export type SaveWorkoutVariables = z.infer<typeof saveWorkoutVariablesSchema>;
export type SaveWorkoutResult = z.infer<typeof saveWorkoutResultSchema>;
export type NewPersonalRecord = SaveWorkoutResult['new_prs'][number];

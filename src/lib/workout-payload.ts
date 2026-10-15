import type {
  CustomExercisePayload,
  ModernSaveWorkoutPayload,
  WorkoutExercisePayload,
} from '../schemas/workout.ts';
import type {
  CustomExerciseDraft,
  WorkoutDraft,
  WorkoutExerciseDraft,
  WorkoutSetDraft,
} from '../stores/workout-store.ts';
import { durationMinutes } from './utils.ts';

/**
 * The draft, rewritten into the shape `save_workout` reads.
 *
 * This is the boundary between what the screen collected and what the database will hold, and it is
 * deliberately a pure function over the draft: the queue has to be able to build the payload at the
 * moment the user finishes, and the payload has to keep meaning the same thing after a reload, when
 * the only thing left is the variables themselves.
 *
 * Nothing is filtered downstream of here. The RPC deletes the workout's cards and their sets and
 * writes whatever the array contains, so this is the only place where "a set the user performed" and
 * "a row they never filled in" can be told apart.
 *
 * The cards travel **in order**, each with its target and its sets inside (migration 0012). No
 * position is computed: the array order *is* the card order, and the RPC numbers the stored position
 * from it — a second copy of the same fact is a second way for the two to disagree.
 */
export function toSaveWorkoutPayload(draft: WorkoutDraft): ModernSaveWorkoutPayload {
  /*
   * Everything a card names is referenced by the payload, because every card is sent. The card is a
   * real row now, so its `exercise_id` is a foreign key: a custom exercise a card names has to be
   * created by `save_workout` or the whole write fails, whether or not the card recorded a set.
   */
  const referenced = new Set(draft.exercises.map((card) => card.exerciseId));

  return {
    /*
     * Both of these are required by the schema even though the RPC would fill them in,
     * and that is the point of requiring them: a write made offline yesterday and
     * resumed today would otherwise be dated today, and a server-generated id would be
     * a new workout on every retry.
     */
    id: draft.workoutId,
    date: draft.date,
    title: blankToNull(draft.title),
    notes: blankToNull(draft.notes),
    // Null while the workout is still open; `durationMinutes` also refuses to count
    // backwards, so a clock that moved during the session yields null and not a
    // negative duration.
    duration_minutes:
      draft.endedAt === null ? null : durationMinutes(draft.startedAt, draft.endedAt),
    exercises: draft.exercises.map(toExercise),
    /*
     * Only the customs a card references. Deleting a card does not delete its definition, and a
     * definition whose card was removed is referenced by nothing the server will write — sending it
     * would create an exercise in the catalogue that the user never trained with and cannot remove
     * from the app.
     */
    custom_exercises: draft.customExercises
      .filter((exercise) => referenced.has(exercise.id))
      .map(toCustomExercise),
  };
}

/**
 * One card: the exercise, its target, and the sets that were actually recorded.
 *
 * A card is sent even when it has neither a target nor a set. That is the change 0012 brings: a card
 * without sets is a real card — someone added it and did not get to write anything down — so it
 * keeps its place in the session instead of disappearing.
 */
function toExercise(card: WorkoutExerciseDraft): WorkoutExercisePayload {
  return {
    exercise_id: card.exerciseId,
    target_reps: card.targetReps,
    target_weight_min: card.targetWeightMin,
    target_weight_max: card.targetWeightMax,
    sets: card.sets.filter(isRecorded).map((set, index) => ({
      id: set.id,
      /*
       * The ordinal inside this card, not across the workout. The same exercise may appear in two
       * cards in one session — two blocks, each numbered from one — and nothing in the schema
       * forbids it: there is no unique constraint on `(workout_id, exercise_id, set_number)`.
       */
      set_number: index + 1,
      reps: set.reps,
      weight_kg: set.weightKg,
      rpe: set.rpe,
      is_warmup: set.isWarmup,
      notes: set.notes,
    })),
  };
}

/**
 * A set is one the user wrote something into.
 *
 * `[+ serie]` adds an empty row, and the RPC neither skips nulls nor counts them: it
 * would be stored as a set that was performed, and would then show up in the session's
 * history and in its volume. Half a set counts — someone who typed the reps and left
 * the weight recorded a set, and dropping it would lose what they typed.
 */
function isRecorded(set: WorkoutSetDraft): boolean {
  return set.reps !== null || set.weightKg !== null;
}

function toCustomExercise(exercise: CustomExerciseDraft): CustomExercisePayload {
  return {
    id: exercise.id,
    // Already trimmed when the draft accepted it; trimmed again because a payload is
    // not required to have come from this build.
    name: exercise.name.trim(),
    muscle_group_id: exercise.muscleGroupId,
  };
}

/**
 * Blank text becomes nothing rather than an empty string.
 *
 * The SQL guards `title` with `NULLIF(payload->>'title', '')` and leaves `notes`
 * unguarded — and `NULLIF` only catches the empty string, so `'   '` would be stored
 * as spaces. Deciding here means "the user wrote nothing" reaches the database as an
 * absent value, which is what the columns' nullability is for.
 */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

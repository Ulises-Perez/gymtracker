import type { SaveWorkoutPayload } from '../schemas/workout.ts';
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
 * This is the boundary between what the screen collected and what the database will
 * hold, and it is deliberately a pure function over the draft: the queue has to be
 * able to build the payload at the moment the user finishes, and the payload has to
 * keep meaning the same thing after a reload, when the only thing left is the
 * variables themselves.
 *
 * Nothing is filtered downstream of here. The RPC deletes the workout's sets and
 * writes whatever the array contains, so this is the only place where "a set the user
 * performed" and "a row they never filled in" can be told apart.
 */
export function toSaveWorkoutPayload(draft: WorkoutDraft): SaveWorkoutPayload {
  const sets = draft.exercises.flatMap(toSets);

  /*
   * Only the customs something will actually reference. Deleting a card does not
   * delete its definition, and a definition whose sets were all left empty is
   * referenced by nothing the server will write — sending it would create an exercise
   * in the catalogue that the user never trained with and cannot remove from the app.
   */
  const referenced = new Set(sets.map((set) => set.exercise_id));

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
    sets,
    /**
     * Only the cards that have a target, and each numbered by its place in the session.
     *
     * The position comes from the card's index and not from the target's position in this array:
     * it says *which card this is*, which is what the database key needs to tell two cards of the
     * same exercise apart. Numbering them 1, 2, 3 in order of appearance would file the target
     * against the wrong exercise the day the same exercise appears twice.
     *
     * A card with all three fields empty is not sent at all: it is a card the user never got around
     * to, and a row of three nulls would say nothing while still being a row.
     */
    exercise_targets: draft.exercises.flatMap((card, index) =>
      hasTarget(card)
        ? [
            {
              exercise_id: card.exerciseId,
              position: index + 1,
              target_reps: card.targetReps,
              target_weight_min: card.targetWeightMin,
              target_weight_max: card.targetWeightMax,
            },
          ]
        : [],
    ),
    custom_exercises: draft.customExercises
      .filter((exercise) => referenced.has(exercise.id))
      .map(toCustomExercise),
  };
}

function toSets(card: WorkoutExerciseDraft): SaveWorkoutPayload['sets'] {
  return card.sets.filter(isRecorded).map((set, index) => ({
    id: set.id,
    exercise_id: card.exerciseId,
    /*
     * The ordinal inside this card, not across the workout. The same exercise may
     * appear in two cards in one session — two blocks, each numbered from one — and
     * nothing in the schema forbids it: there is no unique constraint on
     * `(workout_id, exercise_id, set_number)`.
     */
    set_number: index + 1,
    reps: set.reps,
    weight_kg: set.weightKg,
    rpe: set.rpe,
    is_warmup: set.isWarmup,
    notes: set.notes,
  }));
}

/**
 * Whether the user said anything about what they were aiming for.
 *
 * Any one of the three is enough: they are typed at different moments, and someone who wrote their
 * reps and left the weights for later has set a target.
 */
function hasTarget(card: WorkoutExerciseDraft): boolean {
  return card.targetReps !== null || card.targetWeightMin !== null || card.targetWeightMax !== null;
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

function toCustomExercise(
  exercise: CustomExerciseDraft,
): NonNullable<SaveWorkoutPayload['custom_exercises']>[number] {
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

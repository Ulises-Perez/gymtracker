import { getSupabase } from './supabase.ts';
import { toNumber } from './utils.ts';

/**
 * Reads for the history screen.
 *
 * Same boundary as `catalog-api`: columns are renamed to camelCase here and nowhere else, so the
 * screens never see the database's names.
 */

export type WorkoutSummary = {
  id: string;
  date: string;
  title: string | null;
  durationMinutes: number | null;
  /**
   * How many cards the session had.
   *
   * The Inicio already shows this number for the last workout, and the history is the
   * screen where comparing sessions without opening each one matters. `null` means the
   * read did not ask for it (the detail screen does not need it), not zero.
   */
  exerciseCount: number | null;
};

/**
 * A place in the list: a date and an id, not an offset.
 *
 * The id is what makes it a keyset. Two workouts can share a date — someone training twice in a day
 * — so the date alone is not a position: with `date` as the only key, the second page would start
 * inside the run of rows that share it and repeat or skip the ones at the edge.
 */
export type WorkoutCursor = {
  date: string;
  id: string;
};

export type WorkoutPage = {
  workouts: WorkoutSummary[];
  /** Where the next page starts, or null when this was the last one. */
  nextCursor: WorkoutCursor | null;
};

/**
 * How many workouts a page holds.
 *
 * A screenful and a bit on a phone, and small enough that the first page is quick on a bad
 * connection — which is the connection this app is built for.
 */
const PAGE_SIZE = 20;

type WorkoutRow = {
  id: string;
  date: string;
  title: string | null;
  duration_minutes: number | null;
  workout_exercises?: { count: number }[] | null;
};

export function toWorkoutSummary(row: WorkoutRow): WorkoutSummary {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    durationMinutes: row.duration_minutes,
    // PostgREST returns an aggregate as a one-row array: `[{ count: 3 }]`.
    exerciseCount: row.workout_exercises?.[0]?.count ?? null,
  };
}

/** One set, as the detail screen reads it. */
export type WorkoutSetDetail = {
  id: string;
  exerciseId: string;
  /**
   * The card this set was recorded in.
   *
   * It is what tells two cards of the same exercise apart: the exercise id is shared by both, so it
   * cannot say which block a set belonged to (migration 0012).
   */
  workoutExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  isWarmup: boolean;
};

/**
 * One card in the session: the exercise, its place, and the aim it was given.
 *
 * The set that used to be named by its exercise is named by one of these now, which is what makes
 * the order and a repeated exercise representable at all.
 *
 * The objective of the card is not read: the card does not show it and the repeated session does
 * not carry it, so a column nobody reads is a column the app pays for on every detail. It stays in
 * the database — the CSV export still reads it — and the sessions saved while the app asked for it
 * keep it.
 */
export type WorkoutExerciseDetail = {
  id: string;
  exerciseId: string;
  position: number;
};

export type WorkoutDetail = {
  workout: WorkoutSummary;
  exercises: WorkoutExerciseDetail[];
  sets: WorkoutSetDetail[];
};

type WorkoutSetRow = {
  id: string;
  exercise_id: string;
  workout_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: string | null;
  is_warmup: boolean | null;
};

type WorkoutExerciseRow = {
  id: string;
  exercise_id: string;
  position: number;
};

/**
 * One workout with its cards and their sets.
 *
 * The exercise names are deliberately **not** read here. They come from the catalogue the screen
 * already has cached — the same list the picker used to add the exercise — so a name has one source,
 * and that source keeps working offline.
 */
export async function fetchWorkoutDetail(workoutId: string): Promise<WorkoutDetail> {
  const supabase = await getSupabase();

  /*
   * The three reads are independent and all keyed by the same workout id, so they
   * run together. Awaiting them one after the other made opening a workout cost up
   * to three round trips on the connection this app is built for — a phone with a
   * bad signal, which is the one place the extra seconds are felt.
   */
  const [workout, sets, exercises] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, date, title, duration_minutes')
      .eq('id', workoutId)
      .is('deleted_at', null)
      // Ordered because a query has to end somewhere, and ending on a defined order is what makes
      // the result deterministic instead of merely usually right.
      .order('date'),
    supabase
      .from('workout_sets')
      .select('id, exercise_id, workout_exercise_id, set_number, reps, weight_kg, is_warmup')
      .eq('workout_id', workoutId)
      .is('deleted_at', null)
      .order('set_number'),
    supabase
      .from('workout_exercises')
      .select('id, exercise_id, position')
      .eq('workout_id', workoutId)
      // The order is the point of reading this table: `position` is the place the card had in the
      // session, and it is what the screen shows the cards in.
      .order('position'),
  ]);

  if (workout.error) {
    throw workout.error;
  }

  if (sets.error) {
    throw sets.error;
  }

  if (exercises.error) {
    throw exercises.error;
  }

  const first = (workout.data as WorkoutRow[])[0];

  if (!first) {
    // Gone, or never this user's. Both are a 404, and the screen can say which happened rather than
    // showing an empty workout with no explanation.
    throw new Error('Workout not found');
  }

  return {
    workout: toWorkoutSummary(first),
    exercises: (exercises.data as WorkoutExerciseRow[]).map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      position: row.position,
    })),
    sets: (sets.data as WorkoutSetRow[]).map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      workoutExerciseId: row.workout_exercise_id,
      setNumber: row.set_number,
      reps: row.reps,
      // A5: a DECIMAL arrives as a string and becomes a number here and nowhere else.
      weightKg: row.weight_kg === null ? null : toNumber(row.weight_kg),
      isWarmup: row.is_warmup ?? false,
    })),
  };
}

/**
 * Marks a workout as deleted without removing anything.
 *
 * This is the convention the whole project follows — `body_measurements` set it in 0006. A soft delete
 * keeps the row, so a workout the user removes today stops appearing while the records it produced
 * stay attributable. Deleting the row would take its sets with it through the cascade and silently
 * rewrite history: someone's personal best would vanish from a workout they had already looked at.
 *
 * The moment is an instant, not a date: the column is a `TIMESTAMPTZ`, and this records when it
 * happened rather than which day it was.
 */
export async function softDeleteWorkout(workoutId: string): Promise<void> {
  const supabase = await getSupabase();

  const { error } = await supabase
    .from('workouts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', workoutId);

  if (error) {
    throw error;
  }
}

export async function fetchWorkoutPage(
  userId: string,
  cursor: WorkoutCursor | null,
): Promise<WorkoutPage> {
  const supabase = await getSupabase();

  let query = supabase
    .from('workouts')
    .select('id, date, title, duration_minutes, workout_exercises(count)')
    // Soft delete is the client's job; RLS does not filter it (PLAN section 4.1).
    .is('deleted_at', null)
    .eq('user_id', userId)
    // Newest first, and the id breaks the tie. The database orders the same way the cursor does,
    // which is the whole requirement for a keyset: an order that disagrees with the cursor walks
    // the list in a different sequence than it was paginated in.
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    /*
     * Everything strictly after the cursor in that order: an older date, or the same date with a
     * smaller id. Written as one filter and not as two queries because PostgREST has no tuple
     * comparison — and because "the same date" inside a plain `date.lt` would drop the rest of the
     * day.
     */
    query = query.or(`date.lt.${cursor.date},and(date.eq.${cursor.date},id.lt.${cursor.id})`);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const workouts = (data as WorkoutRow[]).map(toWorkoutSummary);
  const last = workouts.at(-1);

  return {
    workouts,
    // A short page is the end. A full one may still be the end — the next request comes back
    // empty — and asking once more is cheaper than a count nobody asked for.
    nextCursor: workouts.length === PAGE_SIZE && last ? { date: last.date, id: last.id } : null,
  };
}

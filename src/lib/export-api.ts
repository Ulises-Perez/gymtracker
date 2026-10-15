import type { CsvExercise, CsvSet, CsvWorkout } from './csv.ts';
import { getSupabase } from './supabase.ts';
import { toNumber } from './utils.ts';

/**
 * Reads the user's whole history for the export.
 *
 * Same read boundary as `catalog-api` and `history-api`: columns are renamed to camelCase here and
 * nowhere else, and the `DECIMAL` columns become numbers through `toNumber` at this edge. The file
 * itself is built by `toCsv`, which never sees the database's names or its strings.
 *
 * Nothing here reads the unit preference. The export is always kilos, whatever the screen is set to,
 * because an exported file is data and not a screen (S9): the weight leaves the database as the
 * kilogram that is stored and is written as that same kilogram.
 */

/**
 * How many workouts one request asks for.
 *
 * PostgREST caps how many rows a single response returns, so a read that asked once would silently
 * truncate the user's history — the one failure an export must not have, because the file it produces
 * looks complete. The page width is the cap, and the read walks until a page comes back shorter.
 */
export const EXPORT_PAGE_SIZE = 1000;

const EXPORT_SELECT = [
  'date',
  'title',
  'duration_minutes',
  // `workout_exercise_id` is what files a set against its own card instead of its exercise, which
  // is what keeps two cards of the same exercise apart in the file.
  'workout_sets(exercise_id, workout_exercise_id, set_number, reps, weight_kg, rpe, is_warmup, notes, exercise:exercises(name))',
  'workout_exercises(id, position, exercise_id, target_reps, target_weight_min, target_weight_max, exercise:exercises(name))',
].join(', ');

type RawExercise = { name: string } | null;

type RawSet = {
  exercise_id: string;
  workout_exercise_id: string | null;
  set_number: number;
  reps: number | null;
  weight_kg: string | null;
  // `rpe` is DECIMAL(3,1) as well, so it too arrives as a string rather than the number the
  // generated types claim.
  rpe: string | null;
  is_warmup: boolean | null;
  notes: string | null;
  exercise: RawExercise;
};

type RawCard = {
  id: string;
  position: number;
  exercise_id: string;
  target_reps: number | null;
  target_weight_min: string | null;
  target_weight_max: string | null;
  exercise: RawExercise;
};

type RawWorkout = {
  date: string;
  title: string | null;
  duration_minutes: number | null;
  workout_sets: RawSet[] | null;
  workout_exercises: RawCard[] | null;
};

function toCsvSet(row: RawSet): CsvSet {
  return {
    setNumber: row.set_number,
    reps: row.reps,
    // A5: the column arrives as a string, and a blank one is nothing and not zero.
    weightKg: row.weight_kg === null ? null : toNumber(row.weight_kg),
    // `rpe` crosses the same boundary: it is a DECIMAL and would otherwise leave a string in a field
    // the rest of the app reads as a number.
    rpe: row.rpe === null ? null : toNumber(row.rpe),
    isWarmup: row.is_warmup ?? false,
    notes: row.notes,
  };
}

/**
 * One workout, grouped into the **cards** its sets belong to, in the order the session had them.
 *
 * The card is the entity the export files rows against now: the same exercise twice is two cards,
 * and grouping by exercise could not say which set belonged to which — the limit `L41` wrote down.
 * The cards arrive first, sorted by their stored `position`, because that is the order the user
 * made; a set whose card was not read is kept anyway, under the exercise it carries, so a read that
 * could not attribute it does not lose the row.
 */
function toCsvWorkout(row: RawWorkout): CsvWorkout {
  const sets = row.workout_sets ?? [];
  const cards = [...(row.workout_exercises ?? [])].sort((a, b) => a.position - b.position);
  const cardIds = new Set(cards.map((card) => card.id));

  const setsByCard = new Map<string, RawSet[]>();
  const unattributed = new Map<string, RawSet[]>();

  for (const set of sets) {
    if (set.workout_exercise_id !== null && cardIds.has(set.workout_exercise_id)) {
      appendSet(setsByCard, set.workout_exercise_id, set);
    } else {
      appendSet(unattributed, set.exercise_id, set);
    }
  }

  const exercises: CsvExercise[] = cards.map((card) => {
    const group = setsByCard.get(card.id) ?? [];

    return {
      // The card carries the name too, which is what lets a card with a target and no sets still be
      // named rather than showing as a blank row.
      name: card.exercise?.name ?? group[0]?.exercise?.name ?? '',
      targetReps: card.target_reps,
      targetWeightMin: card.target_weight_min === null ? null : toNumber(card.target_weight_min),
      targetWeightMax: card.target_weight_max === null ? null : toNumber(card.target_weight_max),
      sets: group.map(toCsvSet),
    };
  });

  for (const group of unattributed.values()) {
    exercises.push({
      name: group[0]?.exercise?.name ?? '',
      targetReps: null,
      targetWeightMin: null,
      targetWeightMax: null,
      sets: group.map(toCsvSet),
    });
  }

  return {
    date: row.date,
    title: row.title,
    durationMinutes: row.duration_minutes,
    exercises,
  };
}

function appendSet(groups: Map<string, RawSet[]>, key: string, set: RawSet): void {
  const group = groups.get(key);

  if (group) {
    group.push(set);
  } else {
    groups.set(key, [set]);
  }
}

/**
 * Every live workout with its sets and its targets, in date order, paged to the end.
 *
 * The loop is the requirement and not a detail: `range` is asked from the start of the next page on
 * each turn, and a page shorter than `EXPORT_PAGE_SIZE` is the only end. A full page may still be the
 * last one — the next request comes back empty — and asking once more is cheaper than a count nobody
 * asked for.
 *
 * The order is defined by `date` and then `id`, like the history's keyset, so two workouts on the
 * same day cannot swap places between pages and be exported twice or skipped.
 */
export async function fetchAllWorkouts(userId: string): Promise<CsvWorkout[]> {
  const supabase = await getSupabase();
  const rows: RawWorkout[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('workouts')
      .select(EXPORT_SELECT)
      // Soft delete is the client's job; RLS does not filter it (PLAN section 4.1).
      .is('deleted_at', null)
      .eq('user_id', userId)
      // A deleted set is gone from the history, so it is gone from the file too.
      .is('workout_sets.deleted_at', null)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data as unknown as RawWorkout[] | null) ?? [];
    rows.push(...page);

    if (page.length < EXPORT_PAGE_SIZE) {
      break;
    }

    from += EXPORT_PAGE_SIZE;
  }

  return rows.map(toCsvWorkout);
}

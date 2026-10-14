import { getSupabase } from './supabase.ts';

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
};

export function toWorkoutSummary(row: WorkoutRow): WorkoutSummary {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    durationMinutes: row.duration_minutes,
  };
}

export async function fetchWorkoutPage(
  userId: string,
  cursor: WorkoutCursor | null,
): Promise<WorkoutPage> {
  const supabase = await getSupabase();

  let query = supabase
    .from('workouts')
    .select('id, date, title, duration_minutes')
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

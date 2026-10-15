import type { WeightUnit } from './units.ts';
import { getSupabase } from './supabase.ts';

/**
 * The user's own settings.
 *
 * `profiles` is one row per user, and its `id` is the user's id — there is no separate `user_id` — so
 * everything here is scoped by that. The RLS policy scopes it too, which is why the reads and writes
 * below are belt and braces rather than a security boundary.
 */

export type Profile = {
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  weightUnit: WeightUnit;
};

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  weight_unit: string | null;
};

/**
 * Anything that is not pounds is kilos.
 *
 * The column is free text, so a value this build does not know — one written by a later version, or by
 * hand — must not reach a screen as a unit nothing can format. Kilos is the app's own storage unit, so
 * falling back to it is falling back to the truth.
 */
function toWeightUnit(value: string | null): WeightUnit {
  return value === 'lb' ? 'lb' : 'kg';
}

export function toProfile(row: ProfileRow): Profile {
  return {
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    weightUnit: toWeightUnit(row.weight_unit),
  };
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('profiles')
    .select('username, full_name, avatar_url, weight_unit')
    .eq('id', userId)
    // Ending the chain on an order, like every other read in this project: a query has to settle
    // somewhere, and settling on a defined order is what makes the result deterministic.
    .order('id');

  if (error) {
    throw error;
  }

  const first = (data as ProfileRow[])[0];

  if (!first) {
    // A profile row is created with the account (a trigger), so its absence means something is wrong
    // rather than that the user has not set anything up.
    throw new Error('Profile not found');
  }

  return toProfile(first);
}

/**
 * Remembers which unit to show weights in.
 *
 * Only the preference is written and never a weight: the unit is how the app talks, not what it
 * stores, so changing it must leave every `weight_kg` exactly where it was. That is the DoD of S9 in
 * one function.
 */
export async function updateWeightUnit(userId: string, unit: WeightUnit): Promise<void> {
  const supabase = await getSupabase();

  const { error } = await supabase.from('profiles').update({ weight_unit: unit }).eq('id', userId);

  if (error) {
    throw error;
  }
}

/**
 * How many rows one request asks for.
 *
 * PostgREST caps a single response, so a read that asked once would silently truncate the history —
 * and a truncated history is a wrong streak, computed from a prefix of the days. The read walks until
 * a page comes back shorter.
 */
const WORKOUT_DATES_PAGE_SIZE = 1000;

/** Every live workout date of the user, oldest first, paged to the end. */
export async function fetchWorkoutDates(userId: string): Promise<string[]> {
  const supabase = await getSupabase();
  const dates: string[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('workouts')
      .select('date')
      // Soft delete is the client's job; RLS does not filter it (PLAN section 4.1).
      .is('deleted_at', null)
      .eq('user_id', userId)
      // Defined order, like every read here: two workouts on the same day cannot swap places between
      // pages and be read twice or skipped.
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + WORKOUT_DATES_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data as { date: string }[] | null) ?? [];
    dates.push(...page.map((row) => row.date));

    if (page.length < WORKOUT_DATES_PAGE_SIZE) {
      break;
    }

    from += WORKOUT_DATES_PAGE_SIZE;
  }

  return dates;
}

/**
 * The longest run of consecutive days the user has trained.
 *
 * Derived and not stored, which is what the phase asks for: the days are already in `workouts`, and a
 * column would be a second answer to a question the rows already answer. It is deliberately not the
 * streak `dashboard_summary()` returns — that one ends today and a missed day resets it, while "best"
 * is over the whole history.
 *
 * A day is counted once however many sessions it had, and the distance is measured in whole days, so
 * the two sides of a month or a year boundary are still neighbours.
 */
export function bestStreak(dates: string[]): number {
  const days = [...new Set(dates)].map(dayNumber).sort((left, right) => left - right);

  let best = 0;
  let run = 0;
  let previous = Number.NaN;

  for (const day of days) {
    run = day === previous + 1 ? run + 1 : 1;
    previous = day;
    best = Math.max(best, run);
  }

  return best;
}

/** Midnight UTC of an ISO date, as a whole day number, so consecutive days differ by exactly one. */
function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

/**
 * The derived figures the profile shows.
 *
 * `totalWorkouts` is not here: the dashboard summary already returns it, so the profile reuses that
 * read instead of counting the same rows a second time.
 */
export type ProfileStats = {
  bestStreak: number;
  totalPrs: number;
};

/** Reads the two figures that need their own query, in parallel. */
export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  const [dates, totalPrs] = await Promise.all([fetchWorkoutDates(userId), fetchPrCount(userId)]);

  return { bestStreak: bestStreak(dates), totalPrs };
}

/**
 * How many records the user has, as a count of the rows themselves.
 *
 * `personal_records` holds one row per exercise with a live record, so its row count is the total of
 * records. The summary's `recent_prs` cannot answer this: it is capped at five, and five is not a
 * total. The count is asked for with `head`, because the rows themselves are of no interest here.
 */
export async function fetchPrCount(userId: string): Promise<number> {
  const supabase = await getSupabase();

  const { count, error } = await supabase
    .from('personal_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

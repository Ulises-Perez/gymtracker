import { getSupabase } from './supabase.ts';
import { toDisplayWeight } from './units.ts';
import type { WeightUnit } from './units.ts';
import { toNumber } from './utils.ts';

/**
 * The body weight a user logs, through `body_measurements`.
 *
 * The table has existed since `0001`; `0006` put it under the soft-delete convention and replaced its
 * `UNIQUE(user_id, date)` with a partial unique index over the live rows, so "one measurement per day"
 * survives a delete without blocking the day from ever being logged again.
 *
 * Always kilos at this edge. The preferred unit is a reading choice (S9), so a weight is converted to
 * kilos on the way in and only shown in the preferred unit on the way out to a screen.
 */

export type BodyWeightPoint = {
  /** `YYYY-MM-DD`, exactly as the column returns it. */
  date: string;
  /** Always kilos: the table stores kilos and the preferred unit is a reading choice. */
  weightKg: number;
};

type RawMeasurement = {
  date: string;
  // `weight_kg` is a DECIMAL and reaches the client as a string (A5), never as the number the
  // generated types claim.
  weight_kg: string | null;
};

/** The page width the read walks with, because PostgREST caps a single response. */
const BODY_WEIGHT_PAGE_SIZE = 1000;

/**
 * The user's live measurements, oldest first, paged to the end.
 *
 * A row with no `weight_kg` is not a reading and is dropped, so it cannot reach a chart as a zero the
 * user never weighed.
 */
export async function fetchBodyWeights(userId: string): Promise<BodyWeightPoint[]> {
  const supabase = await getSupabase();
  const rows: RawMeasurement[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('body_measurements')
      .select('date, weight_kg')
      // Soft delete is the client's job; RLS does not filter it (PLAN section 4.1).
      .is('deleted_at', null)
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .range(from, from + BODY_WEIGHT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data as unknown as RawMeasurement[] | null) ?? [];
    rows.push(...page);

    if (page.length < BODY_WEIGHT_PAGE_SIZE) {
      break;
    }

    from += BODY_WEIGHT_PAGE_SIZE;
  }

  return rows
    .filter((row) => row.weight_kg !== null)
    .map((row) => ({
      date: row.date,
      // A5: the DECIMAL crosses the boundary here and becomes the number a chart can plot.
      weightKg: toNumber(row.weight_kg),
    }));
}

/**
 * Logs the weight of one day.
 *
 * The day is the key of a measurement, so a second entry for a day the user already logged **updates**
 * that row instead of adding a second one — the rule `0006` enforces with a partial unique index over
 * the live rows. The write therefore looks the live row up first and follows it: an update when the day
 * has one, an insert when it does not.
 *
 * A plain upsert would not do here. PostgREST's `on_conflict=user_id,date` generates
 * `ON CONFLICT (user_id, date)`, and after `0006` there is no unique constraint on those columns — only
 * a partial index with a `WHERE deleted_at IS NULL` predicate, which the arbiter inference cannot match
 * without that predicate. So the conflict target would be refused by the server, and the two-step write
 * is what the current schema allows. Its cost is a race the schema already resolves the right way: two
 * devices logging the same new day at once make the second INSERT hit the index rather than create a
 * duplicate, and that surfaces as a retryable error instead of a corrupt pair.
 */
export async function saveBodyWeight(
  userId: string,
  date: string,
  weightKg: number,
): Promise<void> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('body_measurements')
    .update({ weight_kg: weightKg })
    .eq('user_id', userId)
    .eq('date', date)
    // Only the live row of the day is the one to update: a soft-deleted measurement of the same day
    // is not the measurement.
    .is('deleted_at', null)
    .select('id');

  if (error) {
    throw error;
  }

  if (((data as { id: string }[] | null) ?? []).length > 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from('body_measurements')
    .insert({ user_id: userId, date, weight_kg: weightKg });

  if (insertError) {
    throw insertError;
  }
}

/**
 * What the body-weight chart is handed: two parallel arrays, x and y.
 *
 * Kept out of the component for the same reason `buildChartSeries` is: uPlot draws into a canvas and
 * jsdom has none, so the part that can be wrong in a way a test would catch lives where it can be
 * called directly. The conversion to the preferred unit happens here, once, at the reading edge, and
 * the chart only ever plots what the user reads.
 */
export function buildBodyWeightSeries(
  points: BodyWeightPoint[],
  unit: WeightUnit,
): { x: number[]; y: number[] } {
  return {
    // Midnight UTC, spelled out, matching the axis labels that are formatted in UTC.
    x: points.map((point) => Date.parse(`${point.date}T00:00:00Z`) / 1000),
    y: points.map((point) => toDisplayWeight(point.weightKg, unit)),
  };
}

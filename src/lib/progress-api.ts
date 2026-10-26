import { getSupabase } from './supabase.ts';
import { toDisplayWeight } from './units.ts';
import type { WeightUnit } from './units.ts';
import { toNumber } from './utils.ts';

/**
 * The progress of one exercise, read from `exercise_progress`.
 *
 * That function has done the aggregating since phase 1: one row per day the exercise was trained,
 * with the heaviest set, the volume and the best estimated 1RM, warmups and soft-deleted rows
 * already excluded. The chart therefore plots what the database computed and does no arithmetic of
 * its own — which is also why the numbers here cannot disagree with the history screen.
 */

export type ProgressMetric = 'maxWeight' | 'volume' | 'oneRm';

export type ExerciseProgressPoint = {
  /** `YYYY-MM-DD`, exactly as the column returns it. */
  date: string;
  /**
   * The heaviest set of the day, or `null` when none of its sets recorded a weight.
   *
   * A bodyweight set is a real set: "Dominadas, 12 reps" is stored with `weight_kg = null`.
   * Turning that into zero is a claim nobody made — the person did not lift 0 kg — and it
   * drags the progress line to the floor. The chart leaves a gap and the row prints "—".
   */
  maxWeight: number | null;
  /** `SUM(weight_kg * reps)`; `null` when no set of the day recorded a weight. */
  volume: number | null;
  /** The best Epley estimate of the day, or `null` when no set recorded both numbers. */
  oneRm: number | null;
  sets: number;
};

type ProgressRow = {
  workout_date: string;
  max_weight: string | null;
  total_volume: string | null;
  best_set_1rm: string | null;
  total_sets: number | null;
};

export async function fetchExerciseProgress(exerciseId: string): Promise<ExerciseProgressPoint[]> {
  const supabase = await getSupabase();

  const { data, error } = await supabase.rpc('exercise_progress', { p_exercise_id: exerciseId });

  if (error) {
    throw error;
  }

  /*
   * Through `unknown` on purpose. The generated types say these DECIMAL columns return `number`, and
   * the project's own A5 finding is that they arrive as strings -- the generator describes the
   * schema, not what supabase-js does with a DECIMAL. Claiming the runtime shape directly would be
   * the compiler telling us the two disagree, which is true and is exactly why the hop is here.
   */
  return (data as unknown as ProgressRow[]).map((row) => ({
    date: row.workout_date,
    // A5: the aggregated columns are DECIMAL and reach the client as strings. They become
    // numbers here, once, because a chart that receives "70.00" plots nothing. A null stays
    // null: it is the difference between "did not record a weight" and "lifted zero".
    maxWeight: row.max_weight === null ? null : toNumber(row.max_weight),
    volume: row.total_volume === null ? null : toNumber(row.total_volume),
    oneRm: row.best_set_1rm === null ? null : toNumber(row.best_set_1rm),
    sets: row.total_sets ?? 0,
  }));
}

/** A day, in seconds — the unit the x axis is in. */
const DAY_SECONDS = 86_400;

/**
 * The span the x axis covers, read off the readings themselves.
 *
 * **It takes the series and not the two numbers uPlot offers**, and that is the whole point of its
 * signature. uPlot's default range for an x scale is `[dataMin, dataMax]`, so a series with a single
 * reading has a span of **zero width**: the point lands on the left edge and the tick generator
 * invents labels for days that are in no reading. This function answers a day either side instead.
 *
 * Why it cannot take the arguments: uPlot calls a range function with `(self, null, null, key)` on
 * the path where it recomputes the axis, not with the data's bounds. A version that read `min` and
 * `max` answered `null === null` as "a single reading" and produced a span around 1970, which uPlot
 * then discarded — so the axis fell back to zero width and the fix silently did nothing. Reading the
 * series makes every call agree, whatever uPlot decides to pass.
 */
export function axisSpan(times: number[]): [number, number] {
  const min = Math.min(...times);
  const max = Math.max(...times);

  // No readings at all: the screen draws its empty state instead of a chart, so this is never seen.
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }

  return min === max ? [min - DAY_SECONDS, max + DAY_SECONDS] : [min, max];
}

/**
 * The steps the x axis is allowed to take: a day and up.
 *
 * Every reading is one per day, so a step smaller than a day cannot separate two of them — and it did
 * not help that it tried: over the two-day span a single reading gets, uPlot picked hours, and the
 * axis formatter prints only the day, so the same date landed two or three times in a row. The
 * screenshot review measured exactly that, which is why the axis now says out loud what the data
 * already is. Day-sized steps and up, ascending, so uPlot takes the smallest one that fits the width.
 */
export function dayIncrements(): number[] {
  return [1, 2, 7, 14, 28, 91, 182, 365].map((days) => days * DAY_SECONDS);
}

/**
 * What uPlot is handed: two parallel arrays, x and y.
 *
 * Kept out of the component on purpose. A chart cannot be exercised in jsdom — uPlot draws into a
 * canvas and there is none — so the part that can be wrong in a way tests would catch lives here,
 * where it can be called directly.
 */
export type ChartSeries = {
  /** The x axis, in seconds. */
  x: number[];
  /** The y values; `null` is a day without that reading, and uPlot draws a gap for it. */
  y: (number | null)[];
};

export function buildChartSeries(
  points: ExerciseProgressPoint[],
  metric: ProgressMetric,
  unit: WeightUnit,
): ChartSeries {
  return {
    /*
     * Midnight UTC, spelled out. `Date.parse('2026-10-13')` also reads as UTC, so this is not
     * protecting against a different parse — it is making the choice visible, because the axis
     * labels are formatted in UTC to match and a local-time reading would slide a day for anyone
     * west of Greenwich.
     */
    x: points.map((point) => Date.parse(`${point.date}T00:00:00Z`) / 1000),
    /*
     * The values are stored in kilos and the maths here stay in kilos: picking the metric is the
     * whole computation, and the conversion to the preferred unit happens once, at the very end of
     * this map, which is the edge of reading. That is why the unit is an argument here and not an
     * arithmetic step inside the chart component. A missing reading stays `null` instead of
     * becoming a zero the person never lifted.
     */
    y: points.map((point) => {
      const value =
        point[metric === 'volume' ? 'volume' : metric === 'oneRm' ? 'oneRm' : 'maxWeight'];

      return value === null ? null : toDisplayWeight(value, unit);
    }),
  };
}

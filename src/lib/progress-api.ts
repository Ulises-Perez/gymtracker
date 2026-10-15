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
  maxWeight: number;
  volume: number;
  oneRm: number;
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
    // A5: the aggregated columns are DECIMAL and reach the client as strings. They become numbers
    // here, once, because a chart that receives "70.00" plots nothing.
    maxWeight: row.max_weight === null ? 0 : toNumber(row.max_weight),
    volume: row.total_volume === null ? 0 : toNumber(row.total_volume),
    oneRm: row.best_set_1rm === null ? 0 : toNumber(row.best_set_1rm),
    sets: row.total_sets ?? 0,
  }));
}

/** A day, in seconds — the unit the x axis is in. */
const DAY_SECONDS = 86_400;

/**
 * The span the x axis covers.
 *
 * uPlot picks its own range out of the data, and a series with a single reading has no span to pick
 * from: the axis invents one and prints ticks for days that appear in no reading, which is the chart
 * claiming a history it does not have. A day either side is the smallest honest answer — it says
 * "one measurement" instead of pretending to more.
 *
 * The padding cannot run away: after one call the two ends differ, so a second call returns the span
 * it was handed.
 */
export function axisSpan(min: number, max: number): [number, number] {
  return min === max ? [min - DAY_SECONDS, max + DAY_SECONDS] : [min, max];
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
  y: number[];
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
     * arithmetic step inside the chart component.
     */
    y: points.map((point) =>
      toDisplayWeight(
        point[metric === 'volume' ? 'volume' : metric === 'oneRm' ? 'oneRm' : 'maxWeight'],
        unit,
      ),
    ),
  };
}

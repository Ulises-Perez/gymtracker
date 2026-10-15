import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildChartSeries,
  dayIncrements,
  fetchExerciseProgress,
  axisSpan,
} from './progress-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const EXERCISE_ID = '01920000-0000-7000-8000-0000000000a1';

let fake: ReturnType<typeof import('../testing/fake-supabase.ts').createFakeSupabase>;

beforeEach(async () => {
  const { createFakeSupabase } = await import('../testing/fake-supabase.ts');

  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

describe('fetchExerciseProgress', () => {
  it('calls the function the database already has, and passes it the exercise', async () => {
    fake.rpc.mockResolvedValue({ data: [], error: null });

    await fetchExerciseProgress(EXERCISE_ID);

    // The aggregation is the database's, not the chart's: this asserts the chart is not quietly
    // reading raw sets and doing its own arithmetic on the side.
    expect(fake.rpc).toHaveBeenCalledWith('exercise_progress', { p_exercise_id: EXERCISE_ID });
  });

  it('turns the aggregated decimals into numbers at the boundary', async () => {
    fake.rpc.mockResolvedValue({
      data: [
        {
          workout_date: '2026-10-13',
          max_weight: '70.00',
          total_volume: '1750.00',
          best_set_1rm: '81.67',
          total_sets: 3,
        },
      ],
      error: null,
    });

    const points = await fetchExerciseProgress(EXERCISE_ID);

    // A5: they arrive as strings, and plotting a string draws nothing.
    expect(points[0]).toEqual({
      date: '2026-10-13',
      maxWeight: 70,
      volume: 1750,
      oneRm: 81.67,
      sets: 3,
    });
  });

  it('reads a day with nothing recorded as zero and not as a missing point', async () => {
    fake.rpc.mockResolvedValue({
      data: [
        {
          workout_date: '2026-10-13',
          max_weight: null,
          total_volume: null,
          best_set_1rm: null,
          total_sets: 0,
        },
      ],
      error: null,
    });

    expect((await fetchExerciseProgress(EXERCISE_ID))[0]?.maxWeight).toBe(0);
  });

  it('throws the error whole instead of plotting an empty chart', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(fetchExerciseProgress(EXERCISE_ID)).rejects.toThrow('permission denied');
  });
});

describe('buildChartSeries', () => {
  const POINTS = [
    { date: '2026-10-06', maxWeight: 60, volume: 1200, oneRm: 70, sets: 3 },
    { date: '2026-10-13', maxWeight: 70, volume: 1750, oneRm: 81.67, sets: 3 },
  ];

  it('builds the x axis in seconds, from midnight UTC', () => {
    const series = buildChartSeries(POINTS, 'maxWeight', 'kg');

    expect(series.x).toEqual([
      Date.parse('2026-10-06T00:00:00Z') / 1000,
      Date.parse('2026-10-13T00:00:00Z') / 1000,
    ]);
  });

  it('plots the metric that was asked for', () => {
    expect(buildChartSeries(POINTS, 'maxWeight', 'kg').y).toEqual([60, 70]);
    expect(buildChartSeries(POINTS, 'volume', 'kg').y).toEqual([1200, 1750]);
    expect(buildChartSeries(POINTS, 'oneRm', 'kg').y).toEqual([70, 81.67]);
  });

  it('has the two axes the same length, which is what uPlot requires', () => {
    const series = buildChartSeries(POINTS, 'volume', 'kg');

    expect(series.x).toHaveLength(series.y.length);
  });

  it('returns empty axes for an exercise never trained, instead of failing', () => {
    // A brand new exercise is a real state: the screen says so rather than showing a broken chart.
    expect(buildChartSeries([], 'maxWeight', 'kg')).toEqual({ x: [], y: [] });
  });

  /**
   * The conversion is here and not in the chart component, and the numbers prove it: 100 kg is
   * 220.46 lb, and the series carries pounds once the preference says so. The stored points are
   * untouched -- nothing in this function writes -- because the unit is a reading choice.
   */
  it('converts the plotted values to the preferred unit', () => {
    const pounds = [{ date: '2026-10-13', maxWeight: 100, volume: 500, oneRm: 116.67, sets: 3 }];

    expect(buildChartSeries(pounds, 'maxWeight', 'lb').y).toEqual([100 / 0.45359237]);
    expect(buildChartSeries(pounds, 'maxWeight', 'kg').y).toEqual([100]);
    // The input is the record of what happened, and reading it in pounds does not change it.
    expect(pounds[0]?.maxWeight).toBe(100);
  });
});

/**
 * The span the x axis covers.
 *
 * uPlot picks its own range out of the data, and a series with a single reading has no span to pick
 * from: the axis then invents one and prints ticks for days that appear in no reading, which is the
 * chart claiming a history it does not have. The screenshot review caught it before any test did,
 * because a canvas cannot be asserted in jsdom — so the arithmetic lives out here, where it can.
 */
describe('axisSpan', () => {
  const DAY = 86_400;

  it('gives a single reading a day either side, instead of a range it never had', () => {
    const day = Date.parse('2026-10-15T00:00:00Z') / 1000;

    expect(axisSpan([day])).toEqual([day - DAY, day + DAY]);
  });

  it('leaves a real span exactly as the data has it', () => {
    expect(axisSpan([100, 200])).toEqual([100, 200]);
  });

  it('answers a usable span for no readings, because a range function always has to answer', () => {
    expect(axisSpan([])).toEqual([0, 1]);
  });
});

/**
 * The steps the x axis is allowed to take.
 *
 * Every reading is one per day, so a step smaller than a day cannot separate two of them — and it does
 * not: given a two-day span uPlot picks hours, and the axis formatter prints only the day, so the same
 * date lands two or three times in a row. The screenshot review measured exactly that (14/10 twice on
 * the phone and three times on the desk) after the span fix landed, which is why the axis now says out
 * loud what the data already is.
 */
describe('dayIncrements', () => {
  it('offers nothing smaller than a day, and only whole days above it', () => {
    const increments = dayIncrements();

    expect(Math.min(...increments)).toBe(86_400);
    expect(increments.every((value) => value % 86_400 === 0)).toBe(true);
  });

  it('ascends, so uPlot can take the smallest step that fits the width', () => {
    const increments = dayIncrements();

    expect([...increments].sort((left, right) => left - right)).toEqual(increments);
  });
});

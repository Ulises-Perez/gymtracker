import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../types/database.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { buildBodyWeightSeries, fetchBodyWeights, saveBodyWeight } from './body-weight-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';
const MEASUREMENT_ID = '01920000-0000-7000-8000-0000000000b1';

let fake: ReturnType<typeof createFakeSupabase>;

/** The builder the last query ran on, so its shape can be asserted and not only its result. */
function lastBuilder() {
  return fake.from.mock.results.at(-1)?.value as { calls: string[] } | undefined;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

describe('fetchBodyWeights', () => {
  it('reads the user’s live measurements, with the DECIMAL string turned into a number', async () => {
    fake.setTableResult('body_measurements', {
      data: [
        { date: '2026-10-01', weight_kg: '72.50' },
        // A row with no reading is not a point on a chart, so it is dropped rather than plotted as 0.
        { date: '2026-10-02', weight_kg: null },
        { date: '2026-10-03', weight_kg: '73.10' },
      ],
      error: null,
    });

    // `weight_kg` is a DECIMAL and arrives as a string (A5): the chart cannot plot "72.50".
    expect(await fetchBodyWeights(USER_ID)).toEqual([
      { date: '2026-10-01', weightKg: 72.5 },
      { date: '2026-10-03', weightKg: 73.1 },
    ]);
    expect(lastBuilder()?.calls).toContain(`eq user_id ${USER_ID}`);
    // Soft delete is the client's job; RLS does not filter it.
    expect(lastBuilder()?.calls).toContain('is deleted_at null');
    expect(lastBuilder()?.calls).toContain('order date');
  });
});

describe('saveBodyWeight', () => {
  /**
   * The day is the key of a measurement, so a second entry for a day the user already logged is an
   * update to that row and not a second one. `0006` enforces it in the database with a partial unique
   * index over the live rows, so the read-then-write here is what keeps the write from being refused.
   */
  it('updates the measurement already logged for the day instead of adding a second one', async () => {
    fake.setTableResult('body_measurements', { data: [{ id: MEASUREMENT_ID }], error: null });

    await saveBodyWeight(USER_ID, '2026-10-13', 72.5);

    expect(lastBuilder()?.calls).toContain('update weight_kg=72.5');
    expect(lastBuilder()?.calls).toContain(`eq user_id ${USER_ID}`);
    expect(lastBuilder()?.calls).toContain('eq date 2026-10-13');
    expect(lastBuilder()?.calls).toContain('is deleted_at null');
  });

  it('adds a first measurement for a day that has none, in kilos', async () => {
    const double = createInsertDouble();

    vi.mocked(getSupabase).mockResolvedValue(double.client);

    await saveBodyWeight(USER_ID, '2026-10-13', 72.5);

    // The row is written in kilos; the preferred unit never reaches the table.
    expect(double.inserted).toEqual([{ user_id: USER_ID, date: '2026-10-13', weight_kg: 72.5 }]);
  });
});

describe('buildBodyWeightSeries', () => {
  it('plots the stored kilos in the unit the chart is labelled with', () => {
    const series = buildBodyWeightSeries([{ date: '2026-10-13', weightKg: 72.5 }], 'lb');

    // Midnight UTC, spelled out, because the chart's axis labels are formatted in UTC to match.
    expect(series.x).toEqual([Date.parse('2026-10-13T00:00:00Z') / 1000]);
    // 72.5 kg is 159.8 lb: the conversion happens here, at the reading edge, and not in the chart.
    expect(series.y[0]).toBeCloseTo(159.8, 1);
  });
});

/**
 * A client that also understands `insert`, which the shared double does not.
 *
 * The shared double exists to test reads and updates, and this module is the first to need an INSERT:
 * a day with no measurement has nothing to update. Building the one extra verb here keeps the change
 * inside this test file instead of widening a helper every other test depends on.
 */
function createInsertDouble() {
  const inserted: Record<string, unknown>[] = [];

  const builder: Record<string, unknown> = {
    update: () => builder,
    insert: (values: Record<string, unknown>) => {
      inserted.push(values);

      return builder;
    },
    eq: () => builder,
    is: () => builder,
    select: () => builder,
    then: (onfulfilled: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onfulfilled),
  };

  return {
    client: { from: () => builder } as unknown as SupabaseClient<Database>,
    inserted,
  };
}

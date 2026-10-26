import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { fetchDashboardSummary } from './dashboard-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const SUMMARY = {
  streak: 3,
  week_days: ['2026-10-12', '2026-10-13'],
  recent_prs: [
    {
      exercise_id: '01920000-0000-7000-8000-0000000000a1',
      exercise_name: 'Press Banca',
      best_1rm: '116.67',
      max_weight_kg: '100.00',
      max_reps: 5,
      achieved_at: '2026-10-13',
    },
  ],
  last_workout: {
    id: '01920000-0000-7000-8000-000000000001',
    date: '2026-10-13',
    title: 'Empuje',
    duration_minutes: 52,
    exercise_count: 4,
  },
  total_workouts: 12,
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.rpc.mockResolvedValue({ data: SUMMARY, error: null });
});

describe('fetchDashboardSummary', () => {
  it('asks the database for the whole thing in one call, with the local day', async () => {
    await fetchDashboardSummary('2026-10-18');

    // One call and not five: the summary is the database's, and this asserts the screen is not
    // quietly assembling it from separate reads that can disagree.
    expect(fake.rpc).toHaveBeenCalledWith('dashboard_summary', { p_today: '2026-10-18' });
  });

  it('defaults to the local day when the caller does not pass one', async () => {
    await fetchDashboardSummary();

    expect(fake.rpc).toHaveBeenCalledWith('dashboard_summary', {
      p_today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('turns the aggregated decimals into numbers', async () => {
    const summary = await fetchDashboardSummary();

    // A5: they arrive as strings, and formatting a string as if it were a number prints it wrong.
    expect(summary.recent_prs[0]?.best_1rm).toBe(116.67);
    expect(summary.recent_prs[0]?.max_weight_kg).toBe(100);
  });

  it('accepts a user who has never trained, which is not an error', async () => {
    fake.rpc.mockResolvedValue({
      data: { streak: 0, week_days: [], recent_prs: [], last_workout: null, total_workouts: 0 },
      error: null,
    });

    const summary = await fetchDashboardSummary();

    expect(summary.last_workout).toBeNull();
    expect(summary.streak).toBe(0);
  });

  it('refuses a summary that changed shape instead of rendering nonsense', async () => {
    // A field renamed in the SQL, or one removed: better to say the read failed than to print
    // "undefined kg" and let it look like the user's data.
    fake.rpc.mockResolvedValue({ data: { streak: 'three' }, error: null });

    await expect(fetchDashboardSummary()).rejects.toThrow();
  });

  it('throws the error whole when the read is refused', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(fetchDashboardSummary()).rejects.toThrow('permission denied');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { fetchWorkoutDetail, fetchWorkoutPage } from './history-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';

let fake: ReturnType<typeof createFakeSupabase>;

function row(index: number) {
  return {
    id: `01920000-0000-7000-8000-0000000000${String(index).padStart(2, '0')}`,
    date: '2026-10-13',
    title: `Entrenamiento ${index}`,
    duration_minutes: 50,
  };
}

/** The builder the query ran on, so its shape can be asserted and not only its result. */
function lastBuilder() {
  return fake.from.mock.results.at(-1)?.value as { calls: string[] } | undefined;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.setTableResult('workouts', { data: [row(1)], error: null });
});

describe('fetchWorkoutPage', () => {
  it('asks only for what was not deleted, and only for this user', async () => {
    await fetchWorkoutPage(USER_ID, null);

    // Asserted on the query and not on the result: the result of a query that forgot either of
    // these looks exactly the same in a test, and completely different in production.
    expect(lastBuilder()?.calls).toContain('is deleted_at null');
    expect(lastBuilder()?.calls).toContain(`eq user_id ${USER_ID}`);
  });

  it('orders by date and then by id, which is the order the cursor walks', async () => {
    await fetchWorkoutPage(USER_ID, null);

    // Both, and in this order. With the date alone, two workouts on the same day have no defined
    // order and a page boundary inside that run repeats or skips rows.
    expect(lastBuilder()?.calls).toEqual(expect.arrayContaining(['order date', 'order id']));
  });

  it('hands the database the pair the cursor is made of', async () => {
    await fetchWorkoutPage(USER_ID, {
      date: '2026-10-13',
      id: '01920000-0000-7000-8000-000000000009',
    });

    // One filter and not two: an older date, or the same date with a smaller id. A plain
    // `date.lt` would drop the rest of the same day.
    expect(lastBuilder()?.calls).toContain(
      'or date.lt.2026-10-13,and(date.eq.2026-10-13,id.lt.01920000-0000-7000-8000-000000000009)',
    );
  });

  it('renames the columns at the boundary and nowhere else', async () => {
    const page = await fetchWorkoutPage(USER_ID, null);

    expect(page.workouts[0]).toEqual({
      id: row(1).id,
      date: '2026-10-13',
      title: 'Entrenamiento 1',
      durationMinutes: 50,
    });
  });

  it('returns a cursor built from the last row when the page came back full', async () => {
    fake.setTableResult('workouts', {
      data: Array.from({ length: 20 }, (_, index) => row(index)),
      error: null,
    });

    const page = await fetchWorkoutPage(USER_ID, null);

    // The last row's pair, not the first's and not a count: the cursor is a position in the list.
    expect(page.nextCursor).toEqual({ date: '2026-10-13', id: row(19).id });
  });

  it('returns no cursor when the page came back short', async () => {
    const page = await fetchWorkoutPage(USER_ID, null);

    expect(page.nextCursor).toBeNull();
  });

  it('throws the error whole instead of returning an empty list', async () => {
    fake.setTableResult('workouts', { data: null, error: { message: 'permission denied' } });

    // An empty list and a denied query look the same on screen unless the failure is raised.
    await expect(fetchWorkoutPage(USER_ID, null)).rejects.toThrow('permission denied');
  });
});

describe('fetchWorkoutDetail', () => {
  const SET_ROW = {
    id: '01920000-0000-7000-8000-0000000000b1',
    exercise_id: '01920000-0000-7000-8000-0000000000a1',
    set_number: 1,
    reps: 10,
    weight_kg: '70.00',
    is_warmup: false,
  };

  beforeEach(() => {
    fake.setTableResult('workout_sets', { data: [SET_ROW], error: null });
  });

  it('turns the decimal into a number at the boundary, and nowhere else', async () => {
    const detail = await fetchWorkoutDetail(row(1).id);

    // A5: the column arrives as a string, and arithmetic on it would concatenate.
    expect(detail.sets[0]?.weightKg).toBe(70);
  });

  it('keeps an unwritten weight as nothing instead of turning it into zero', async () => {
    fake.setTableResult('workout_sets', { data: [{ ...SET_ROW, weight_kg: null }], error: null });

    // Zero would be a claim that someone lifted nothing; the column is nullable for a reason.
    expect((await fetchWorkoutDetail(row(1).id)).sets[0]?.weightKg).toBeNull();
  });

  it('refuses a workout that is not there instead of returning an empty one', async () => {
    fake.setTableResult('workouts', { data: [], error: null });

    // Deleted, or never this user's — and RLS makes those indistinguishable, which is why the
    // screen says "may have been deleted" rather than guessing.
    await expect(fetchWorkoutDetail(row(1).id)).rejects.toThrow('Workout not found');
  });

  it('throws the error whole when the sets cannot be read', async () => {
    fake.setTableResult('workout_sets', { data: null, error: { message: 'permission denied' } });

    await expect(fetchWorkoutDetail(row(1).id)).rejects.toThrow('permission denied');
  });
});

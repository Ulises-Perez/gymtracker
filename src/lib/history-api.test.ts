import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { fetchWorkoutDetail, fetchWorkoutPage, softDeleteWorkout } from './history-api.ts';
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
  const EXERCISE_ID = '01920000-0000-7000-8000-0000000000a1';
  const CARD_ID = '01920000-0000-7000-8000-0000000000c1';

  const SET_ROW = {
    id: '01920000-0000-7000-8000-0000000000b1',
    exercise_id: EXERCISE_ID,
    workout_exercise_id: CARD_ID,
    set_number: 1,
    reps: 10,
    weight_kg: '70.00',
    is_warmup: false,
  };

  const CARD_ROW = {
    id: CARD_ID,
    exercise_id: EXERCISE_ID,
    position: 1,
    target_reps: null,
    target_weight_min: null,
    target_weight_max: null,
  };

  /** The builder one table's query ran on, so its shape can be asserted separately. */
  function builderFor(table: string): { calls: string[] } | undefined {
    const index = fake.from.mock.calls.findIndex(([name]) => name === table);

    return index === -1
      ? undefined
      : (fake.from.mock.results[index]?.value as { calls: string[] } | undefined);
  }

  beforeEach(() => {
    fake.setTableResult('workout_sets', { data: [SET_ROW], error: null });
    fake.setTableResult('workout_exercises', { data: [CARD_ROW], error: null });
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

  /**
   * A set belongs to a **card**, not to an exercise, and that is the whole reason 0012 exists: with
   * the same exercise in two cards, the exercise id cannot say which block the set was part of. The
   * read has to carry the card id, and it has to ask the database for the column.
   */
  it('attributes each set to the card it belongs to', async () => {
    const detail = await fetchWorkoutDetail(row(1).id);

    expect(detail.sets[0]?.workoutExerciseId).toBe(CARD_ID);
    expect(builderFor('workout_sets')?.calls.join(' ')).toContain('workout_exercise_id');
  });

  /**
   * The position is what makes the order the database stores the order the screen shows. It has to
   * be read, and the read has to ask for it in that order.
   */
  it('reads the cards with their place, in order', async () => {
    const detail = await fetchWorkoutDetail(row(1).id);

    expect(detail.exercises).toEqual([
      {
        id: CARD_ID,
        exerciseId: EXERCISE_ID,
        position: 1,
        targetReps: null,
        targetWeightMin: null,
        targetWeightMax: null,
      },
    ]);
    expect(builderFor('workout_exercises')?.calls).toContain('order position');
  });

  /**
   * Repeating a workout faithfully needs the target that was stored on each card, and that target
   * has lived in this table since 0012. A target the read does not ask for is a target that always
   * arrives null, which would repeat the exercises without the aim they had.
   */
  it('reads each card target, turning the decimal weights into numbers', async () => {
    fake.setTableResult('workout_exercises', {
      data: [
        {
          ...CARD_ROW,
          target_reps: 8,
          target_weight_min: '60.00',
          target_weight_max: '80.00',
        },
        {
          ...CARD_ROW,
          id: '01920000-0000-7000-8000-0000000000c2',
          position: 2,
        },
      ],
      error: null,
    });

    const detail = await fetchWorkoutDetail(row(1).id);

    expect(detail.exercises[0]).toMatchObject({
      targetReps: 8,
      targetWeightMin: 60,
      targetWeightMax: 80,
    });
    // A card with no target stays null instead of collapsing to zero: zero is a claim nobody made.
    expect(detail.exercises[1]).toMatchObject({
      targetReps: null,
      targetWeightMin: null,
      targetWeightMax: null,
    });
    expect(builderFor('workout_exercises')?.calls.join(' ')).toContain('target_reps');
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

  it('throws the error whole when the cards cannot be read', async () => {
    fake.setTableResult('workout_exercises', {
      data: null,
      error: { message: 'permission denied' },
    });

    // Swallowed, this failure would render a workout with no exercises at all -- the same screen a
    // workout that really was empty would show.
    await expect(fetchWorkoutDetail(row(1).id)).rejects.toThrow('permission denied');
  });
});

describe('softDeleteWorkout', () => {
  it('sets the moment instead of removing the row, and never writes null', async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date('2026-10-13T18:00:00.000Z'));

      await softDeleteWorkout(row(1).id);

      /*
       * The value and not only the column: an UPDATE is a soft delete and a DELETE would take the sets
       * with it, but `deleted_at: null` is the quiet third option — a soft delete turned into a no-op
       * that leaves the workout in the history forever while the code still reads like it deletes.
       */
      expect(lastBuilder()?.calls).toContain('update deleted_at=2026-10-13T18:00:00.000Z');
      expect(lastBuilder()?.calls).toContain(`eq id ${row(1).id}`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws the error whole when the update is refused', async () => {
    fake.setTableResult('workouts', { data: null, error: { message: 'permission denied' } });

    await expect(softDeleteWorkout(row(1).id)).rejects.toThrow('permission denied');
  });
});

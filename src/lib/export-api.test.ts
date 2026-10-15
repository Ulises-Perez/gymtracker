import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { fetchAllWorkouts } from './export-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';
const EXERCISE_ID = '01920000-0000-7000-8000-0000000000a1';
const CARD_ID = '01920000-0000-7000-8000-0000000000c1';

/**
 * The page size the export pages with: PostgREST caps how many rows a single request returns, so the
 * read has to walk the whole history and this is the width of one step.
 */
const PAGE_SIZE = 1000;

let fake: ReturnType<typeof createFakeSupabase>;

function setRow(setNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: EXERCISE_ID,
    workout_exercise_id: CARD_ID,
    set_number: setNumber,
    reps: 5,
    weight_kg: '72.50',
    rpe: '8.0',
    is_warmup: false,
    notes: null,
    exercise: { name: 'Sentadilla' },
    ...overrides,
  };
}

/** A card, which is what a set is filed against now. Its `position` is the session's order. */
function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CARD_ID,
    position: 1,
    exercise_id: EXERCISE_ID,
    target_reps: null,
    target_weight_min: null,
    target_weight_max: null,
    exercise: { name: 'Sentadilla' },
    ...overrides,
  };
}

function workoutRow(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-10-13',
    title: 'Piernas',
    duration_minutes: 50,
    workout_sets: [setRow(1)],
    workout_exercises: [cardRow()],
    ...overrides,
  };
}

/** The builder the last query ran on, so its shape can be asserted and not only its result. */
function builders(): { calls: string[] }[] {
  return fake.from.mock.results.map((result) => result.value as { calls: string[] });
}

function lastBuilder(): { calls: string[] } | undefined {
  return builders().at(-1);
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.setTableResult('workouts', { data: [workoutRow()], error: null });
});

describe('fetchAllWorkouts', () => {
  it('asks only for live workouts of this user and for live sets', async () => {
    await fetchAllWorkouts(USER_ID);

    // Asserted on the query and not on the result: an export that forgot either scope looks the
    // same in a test and completely different in production.
    expect(lastBuilder()?.calls).toContain(`eq user_id ${USER_ID}`);
    expect(lastBuilder()?.calls).toContain('is deleted_at null');
    expect(lastBuilder()?.calls).toContain('is workout_sets.deleted_at null');
  });

  it('reads the whole history in one nested select, not a request per workout', async () => {
    await fetchAllWorkouts(USER_ID);

    const select = lastBuilder()?.calls.find((call) => call.startsWith('select'));

    // The sets, the cards and the exercise names all travel with the workout: an export is data and
    // cannot lean on a catalogue that may not be loaded. `workout_exercise_id` is what lets a set be
    // filed against its own card instead of its exercise.
    expect(select).toContain('workout_sets(');
    expect(select).toContain('workout_exercise_id');
    expect(select).toContain('workout_exercises(');
    expect(select).toContain('exercises(name)');
  });

  it('pages with range until a page comes back shorter than the page size', async () => {
    const first = Array.from({ length: PAGE_SIZE }, () => workoutRow());
    const second = [workoutRow()];
    fake.setTableResults('workouts', [
      { data: first, error: null },
      { data: second, error: null },
    ]);

    const workouts = await fetchAllWorkouts(USER_ID);

    // PostgREST caps a single response, so one request would silently truncate the user's history.
    expect(fake.from).toHaveBeenCalledTimes(2);
    expect(builders()[0]?.calls).toContain(`range 0 ${PAGE_SIZE - 1}`);
    expect(builders()[1]?.calls).toContain(`range ${PAGE_SIZE} ${PAGE_SIZE * 2 - 1}`);
    expect(workouts).toHaveLength(PAGE_SIZE + 1);
  });

  it('stops after one request when the first page is short', async () => {
    fake.setTableResult('workouts', { data: [workoutRow()], error: null });

    await fetchAllWorkouts(USER_ID);

    // A short page is the end; asking again would be a request whose answer is already known.
    expect(fake.from).toHaveBeenCalledTimes(1);
  });

  it('turns the decimal columns into numbers at the boundary and keeps a blank one blank', async () => {
    fake.setTableResult('workouts', {
      data: [
        workoutRow({
          workout_sets: [setRow(1), setRow(2, { weight_kg: null })],
        }),
      ],
      error: null,
    });

    const sets = (await fetchAllWorkouts(USER_ID))[0]?.exercises[0]?.sets ?? [];

    // A5: a DECIMAL arrives as a string, and `72.50` has to become 72.5 here and nowhere else.
    expect(sets[0]?.weightKg).toBe(72.5);
    // `rpe` is DECIMAL too, so it goes through the same boundary and reads as a number.
    expect(sets[0]?.rpe).toBe(8);
    // And a blank weight stays nothing: zero would be a claim that someone lifted nothing.
    expect(sets[1]?.weightKg).toBeNull();
  });

  it('carries the session target of each card, and keeps one that has no sets', async () => {
    fake.setTableResult('workouts', {
      data: [
        workoutRow({
          workout_sets: [],
          workout_exercises: [
            cardRow({
              target_reps: 10,
              target_weight_min: '60.00',
              target_weight_max: '80.00',
              exercise: { name: 'Press banca' },
            }),
          ],
        }),
      ],
      error: null,
    });

    const exercises = (await fetchAllWorkouts(USER_ID))[0]?.exercises ?? [];

    expect(exercises[0]).toEqual({
      name: 'Press banca',
      targetReps: 10,
      targetWeightMin: 60,
      targetWeightMax: 80,
      sets: [],
    });
  });

  /**
   * The same exercise twice in one session is two cards, and each set belongs to the card it was
   * recorded in. Grouping by exercise merged the two blocks and could not say which set was which —
   * the note this fixes was already written in `L41`.
   *
   * The cards arrive out of position order so the assertion is about the **stored** order and not
   * about the order the response happened to use.
   */
  it('keeps two cards of the same exercise apart, in their stored order', async () => {
    fake.setTableResult('workouts', {
      data: [
        workoutRow({
          workout_sets: [
            setRow(1, { workout_exercise_id: 'card-b', weight_kg: '100.00' }),
            setRow(1, { workout_exercise_id: 'card-a', weight_kg: '70.00' }),
          ],
          workout_exercises: [
            cardRow({ id: 'card-b', position: 2 }),
            cardRow({ id: 'card-a', position: 1 }),
          ],
        }),
      ],
      error: null,
    });

    const exercises = (await fetchAllWorkouts(USER_ID))[0]?.exercises ?? [];

    expect(exercises).toHaveLength(2);
    expect(exercises[0]?.sets[0]?.weightKg).toBe(70);
    expect(exercises[1]?.sets[0]?.weightKg).toBe(100);
  });

  /**
   * A set the read could not attribute to a card is still the user's data, so it still goes in the
   * file, named after the exercise it carries. Dropping it would be the export silently losing a
   * row, which is the one failure an export must not have.
   */
  it('still exports a set whose card was not read, under its own exercise name', async () => {
    fake.setTableResult('workouts', {
      data: [
        workoutRow({
          workout_exercises: [],
          workout_sets: [
            setRow(1, { workout_exercise_id: null, exercise: { name: 'Sentadilla' } }),
          ],
        }),
      ],
      error: null,
    });

    const exercises = (await fetchAllWorkouts(USER_ID))[0]?.exercises ?? [];

    expect(exercises[0]?.name).toBe('Sentadilla');
    expect(exercises[0]?.sets).toHaveLength(1);
  });

  it('throws the error whole instead of returning a half-empty file', async () => {
    fake.setTableResult('workouts', { data: null, error: { message: 'permission denied' } });

    await expect(fetchAllWorkouts(USER_ID)).rejects.toThrow('permission denied');
  });
});

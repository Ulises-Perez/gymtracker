import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { WorkoutDetailPage } from './WorkoutDetailPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

const WORKOUT_ID = '33333333-3333-4333-8333-333333333333';
const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';
const CARD_ID = '01920000-0000-7000-8000-0000000000c1';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

/**
 * Rendered through a real route rather than a mocked `useParams`: the page reads its id from the
 * address, and a test that hands it one directly would not notice the day the route stops passing it.
 */
function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/history/${WORKOUT_ID}`]}>
        <Routes>
          <Route path="/history/:workoutId" element={<WorkoutDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('workouts', {
    data: [{ id: WORKOUT_ID, date: '2026-10-13', title: 'Empuje', duration_minutes: 52 }],
    error: null,
  });
  fake.setTableResult('workout_exercises', {
    data: [{ id: CARD_ID, exercise_id: PRESS_BANCA, position: 1 }],
    error: null,
  });
  fake.setTableResult('workout_sets', {
    data: [
      {
        id: 'set-1',
        exercise_id: PRESS_BANCA,
        workout_exercise_id: CARD_ID,
        set_number: 1,
        reps: 10,
        weight_kg: '70.00',
        is_warmup: false,
      },
      {
        id: 'set-2',
        exercise_id: PRESS_BANCA,
        workout_exercise_id: CARD_ID,
        set_number: 2,
        reps: 8,
        weight_kg: '75.00',
        is_warmup: false,
      },
    ],
    error: null,
  });
  fake.setTableResult('exercises', {
    data: [{ id: PRESS_BANCA, name: 'Press Banca', muscle_group_id: 'mg-pecho', is_custom: false }],
    error: null,
  });
  fake.setTableResult('muscle_groups', {
    data: [{ id: 'mg-pecho', name: 'Pecho', icon: null }],
    error: null,
  });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('WorkoutDetailPage', () => {
  it('shows the workout and its sets, under the name the catalogue has for them', async () => {
    renderPage();

    expect(await screen.findByText('13/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Empuje')).toBeInTheDocument();
    expect(screen.getByText('52 min')).toBeInTheDocument();

    // The name comes from the catalogue, which is also the list the picker used to add it.
    expect(await screen.findByRole('heading', { name: 'Press Banca' })).toBeInTheDocument();
    /*
     * One decimal, and that changed with T4.4b: the line is formatted by `formatWeight`, the app's
     * single weight formatter, so a kilo and a pound read the same way. The assertion is stronger
     * for it -- it now pins the formatter and not a coincidence of the stored value.
     */
    expect(screen.getByText(/1ª · 10 × 70\.0 kg/)).toBeInTheDocument();
    expect(screen.getByText(/2ª · 8 × 75\.0 kg/)).toBeInTheDocument();
  });

  /**
   * Rule two: a reading screen renders stored kilos in the preferred unit.
   *
   * The stored value is kilos and stays kilos -- nothing here writes -- and the conversion happens
   * on the way to the screen, once, from the unit the profile stores.
   */
  it('reads stored kilos in the preferred unit', async () => {
    fake.setTableResult('profiles', {
      data: [{ username: null, full_name: null, avatar_url: null, weight_unit: 'lb' }],
      error: null,
    });
    fake.setTableResult('workout_sets', {
      data: [
        {
          id: 'set-1',
          exercise_id: PRESS_BANCA,
          workout_exercise_id: CARD_ID,
          set_number: 1,
          reps: 10,
          weight_kg: '100.00',
          is_warmup: false,
        },
      ],
      error: null,
    });

    renderPage();

    // 100 kg is 220.5 lb, and the screen shows the pounds and not the kilos it stored.
    expect(await screen.findByText(/1ª · 10 × 220\.5 lb/)).toBeInTheDocument();
    expect(screen.queryByText(/100\.0 kg/)).not.toBeInTheDocument();
  });

  it('keeps a missing weight as a dash instead of calling it zero pounds', async () => {
    fake.setTableResult('profiles', {
      data: [{ username: null, full_name: null, avatar_url: null, weight_unit: 'lb' }],
      error: null,
    });
    fake.setTableResult('workout_sets', {
      data: [
        {
          id: 'set-1',
          exercise_id: PRESS_BANCA,
          workout_exercise_id: CARD_ID,
          set_number: 1,
          reps: 10,
          weight_kg: null,
          is_warmup: false,
        },
      ],
      error: null,
    });

    renderPage();

    // A set left half written is a record of what happened, and "0 lb" is a claim nobody made.
    expect(await screen.findByText(/1ª · 10 × —/)).toBeInTheDocument();
  });

  /**
   * The same exercise twice in one session is two cards, and each set has to land in the card it
   * was recorded in. Grouping by exercise would stack the two blocks into one, which is the reason
   * 0012 gave the card an identity of its own.
   *
   * The cards arrive deliberately out of order so the assertion is about the **stored** order, not
   * about the order the query happened to hand them over.
   */
  it('keeps two cards of the same exercise apart, in the stored order', async () => {
    fake.setTableResult('workout_exercises', {
      data: [
        { id: 'card-b', exercise_id: PRESS_BANCA, position: 2 },
        { id: 'card-a', exercise_id: PRESS_BANCA, position: 1 },
      ],
      error: null,
    });
    fake.setTableResult('workout_sets', {
      data: [
        {
          id: 'set-a',
          exercise_id: PRESS_BANCA,
          workout_exercise_id: 'card-a',
          set_number: 1,
          reps: 10,
          weight_kg: '70.00',
          is_warmup: false,
        },
        {
          id: 'set-b',
          exercise_id: PRESS_BANCA,
          workout_exercise_id: 'card-b',
          set_number: 1,
          reps: 5,
          weight_kg: '100.00',
          is_warmup: false,
        },
      ],
      error: null,
    });

    renderPage();

    const lists = await screen.findAllByRole('list', { name: 'Series de Press Banca' });

    expect(lists).toHaveLength(2);
    expect(lists[0]).toHaveTextContent(/1ª · 10 × 70\.0 kg/);
    expect(lists[1]).toHaveTextContent(/1ª · 5 × 100\.0 kg/);
  });

  it('says the workout may be gone when it cannot be read', async () => {
    fake.setTableResult('workouts', { data: [], error: null });

    renderPage();

    // Deleted, or never this user's: RLS makes the two indistinguishable, so the screen says what it
    // actually knows instead of picking one.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar este entrenamiento',
    );
  });

  it('keeps a way back to the list while it loads', () => {
    renderPage();

    expect(screen.getByRole('link', { name: '← Historial' })).toBeInTheDocument();
  });

  it('asks before deleting, and says what deleting means', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Borrar este entrenamiento' }));

    // A soft delete stops showing it and keeps the sets, and the confirmation says exactly that
    // instead of promising it can be brought back — there is no screen that does that.
    expect(await screen.findByRole('alert')).toHaveTextContent('sus series quedan guardadas');
  });

  it('does not delete when the confirmation is cancelled', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Borrar este entrenamiento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    /*
     * Asserted on the steps of the last query and not on `from` having been called: the page reads
     * `workouts` on mount to show the detail, so the call itself proves nothing. What matters is that
     * no `update` was issued and that the destructive button is gone.
     */
    const calls = (fake.from.mock.results.at(-1)?.value as { calls: string[] }).calls;

    expect(calls.some((call) => call.startsWith('update'))).toBe(false);
    expect(screen.queryByRole('button', { name: 'Sí, borrar' })).not.toBeInTheDocument();
  });
});

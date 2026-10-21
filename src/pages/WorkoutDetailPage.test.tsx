import { MutationObserver, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { SAVE_WORKOUT_MUTATION_KEY } from '../lib/queued-mutations.ts';
import type { QueuedMutationVariables } from '../lib/queued-mutations.ts';
import { getSupabase } from '../lib/supabase.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { queuedSaveWorkout } from '../testing/workout-fixtures.ts';
import { WorkoutDetailPage } from './WorkoutDetailPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

const WORKOUT_ID = '33333333-3333-4333-8333-333333333333';
const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';
const CARD_ID = '01920000-0000-7000-8000-0000000000c1';
const USER_ID = '00000000-0000-4000-a000-000000000001';

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
          {/* Where repeating sends the user, stubbed so the destination can be asserted. */}
          <Route path="/workout" element={<div>Pantalla de entrenamiento</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * A save still in the queue, held there for the whole test.
 *
 * The write never settles, which is what a queued write looks like from the screen: the draft is
 * already captured as self-describing variables and is no longer the only copy.
 */
function queueSave(): void {
  const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
    mutationKey: SAVE_WORKOUT_MUTATION_KEY,
    mutationFn: () => new Promise(() => {}),
  });

  void observer.mutate(queuedSaveWorkout())?.catch(() => undefined);
}

beforeEach(() => {
  // The page reads the stored draft to know whether there is one to protect. A test that does not
  // care about that starts from a read that already happened and no draft.
  useWorkoutStore.setState({ draft: null, hydrated: true });

  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('workouts', {
    data: [{ id: WORKOUT_ID, date: '2026-10-13', title: 'Empuje', duration_minutes: 52 }],
    error: null,
  });
  fake.setTableResult('workout_exercises', {
    data: [
      {
        id: CARD_ID,
        exercise_id: PRESS_BANCA,
        position: 1,
        target_reps: 5,
        target_weight_min: '60.00',
        target_weight_max: '80.00',
      },
    ],
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

  it('marks the reads the deleted workout was in as stale', async () => {
    /*
     * The home screen reads the summary of the account, and that read is cached: without being
     * told that the workout is gone, it keeps answering with a workout that was deleted, and the
     * Inicio shows a streak and a last workout that do not exist any more.
     */
    client.setQueryData(['dashboard', USER_ID], {
      streak: 1,
      last_workout: { id: WORKOUT_ID, date: '2026-10-13', exercise_count: 0 },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Borrar este entrenamiento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, borrar' }));

    await waitFor(() => {
      expect(client.getQueryState(['dashboard', USER_ID])?.isInvalidated).toBe(true);
    });
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

  describe('repeating a workout', () => {
    it('asks before replacing a workout that is still open, and cancel leaves it alone', async () => {
      const store = useWorkoutStore.getState();

      store.start();
      store.addExercise(PRESS_BANCA);

      const workoutId = useWorkoutStore.getState().draft?.workoutId;
      const cardId = useWorkoutStore.getState().draft?.exercises[0]?.id;

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Repetir este entrenamiento' }));

      // The same two-step confirmation the workout screen already uses for a draft nobody saved.
      expect(screen.getByText(/se va a perder/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sí, descartarlo' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      // Cancelling changes nothing: an unsaved session is the only copy there is.
      expect(useWorkoutStore.getState().draft?.workoutId).toBe(workoutId);
      expect(useWorkoutStore.getState().draft?.exercises[0]?.id).toBe(cardId);
      expect(screen.queryByRole('button', { name: 'Sí, descartarlo' })).not.toBeInTheDocument();
    });

    it('replaces the open draft once losing it is confirmed', async () => {
      const store = useWorkoutStore.getState();

      store.start();

      const previous = useWorkoutStore.getState().draft?.workoutId;

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Repetir este entrenamiento' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sí, descartarlo' }));

      const repeated = useWorkoutStore.getState().draft;

      expect(repeated?.workoutId).not.toBe(previous);
      expect(repeated?.status).toBe('draft');
      expect(repeated?.title).toBe('Empuje');
      expect(repeated?.exercises.map((card) => card.exerciseId)).toEqual([PRESS_BANCA]);
      expect(repeated?.exercises[0]).toMatchObject({ sets: [] });
      // The objective of the session being repeated does not travel: it is a number nobody lifted,
      // and the card has nowhere to show it.
      expect(repeated?.exercises[0]).not.toHaveProperty('targetReps');
    });

    it('lands on the workout screen with the repeated draft ready to train', async () => {
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Repetir este entrenamiento' }));

      // A repeat ends on the screen where the session is trained, with the draft already armed.
      expect(await screen.findByText('Pantalla de entrenamiento')).toBeInTheDocument();
      expect(useWorkoutStore.getState().draft?.status).toBe('draft');
    });

    /**
     * Reading the device is asynchronous, and until it finishes the screen cannot tell "there is no
     * draft" from "the draft has not been read". A tap must not be able to act on that guess.
     */
    it('does not let a tap replace a draft it has not read yet', async () => {
      useWorkoutStore.setState({ draft: null, hydrated: false });

      renderPage();

      expect(
        await screen.findByRole('button', { name: 'Repetir este entrenamiento' }),
      ).toBeDisabled();
    });

    /**
     * A finished draft whose retries ran out is the whole point of the shared rule: the queue no
     * longer holds it, so the draft is the only copy left and replacing it has to be a choice.
     */
    it('asks before replacing a finished workout whose retries ran out', async () => {
      const store = useWorkoutStore.getState();

      store.start();
      store.finish();

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Repetir este entrenamiento' }));

      // The same question the workout screen asks for the same state, word for word.
      expect(screen.getByText(/se va a perder/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sí, descartarlo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });

    /**
     * The other half of the same rule: a finished draft that is still in the queue is already
     * captured as self-describing variables, so replacing it loses nothing and the tap stays a tap.
     */
    it('does not ask when the finished workout is already in the queue', async () => {
      const store = useWorkoutStore.getState();

      store.start();
      store.finish();

      queueSave();

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Repetir este entrenamiento' }));

      expect(await screen.findByText('Pantalla de entrenamiento')).toBeInTheDocument();
      expect(screen.queryByText(/se va a perder/)).not.toBeInTheDocument();
    });
  });
});

/**
 * S3: both links on this screen have to look like links.
 *
 * The exercise name is the **only** route into the progress chart, so its underline is the only thing
 * that says the name is a destination. It and the way back were drawn in the separator rule
 * (`rule`, #d8d6cf) over the paper -- 1.30:1, against the 3:1 WCAG 1.4.11 asks -- and both now opt
 * into the shared `link-ruled` class declared once in `src/index.css`.
 */
describe('the links on this page', () => {
  it('underlines the way back and the exercise name with the shared link class', async () => {
    renderPage();

    const back = screen.getByRole('link', { name: '← Historial' });
    // Rendered once the catalogue answers with the name of the exercise.
    const toProgress = await screen.findByRole('link', { name: 'Press Banca' });

    for (const link of [back, toProgress]) {
      expect(link).toHaveClass('link-ruled');
      expect(link).not.toHaveClass('decoration-rule');
    }
  });
});

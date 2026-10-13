import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { WorkoutPage } from './WorkoutPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

/*
 * The route sits behind `RequireAuth`, so the session is the gate's business and not
 * this screen's. Mocking the hook is what keeps the test about the workout rather than
 * about the auth provider.
 */
vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

const PRESS_BANCA = {
  id: '01920000-0000-7000-8000-0000000000a1',
  name: 'Press Banca',
  muscle_group_id: 'mg-pecho',
  is_custom: false,
};

const MUSCLE_GROUPS = [{ id: 'mg-pecho', name: 'Pecho', icon: null }];

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <WorkoutPage />
    </QueryClientProvider>,
  );
}

function draft() {
  return useWorkoutStore.getState().draft;
}

/** Opens the picker and picks a catalogue exercise, which is two taps. */
async function addPressBanca() {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Press Banca' }));
}

beforeEach(() => {
  // `hydrated` is what the screen waits on, and the store reads it asynchronously.
  // A test that does not care about the wait starts from a read that already happened.
  useWorkoutStore.setState({ draft: null, hydrated: true });

  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('exercises', { data: [PRESS_BANCA], error: null });
  fake.setTableResult('muscle_groups', { data: MUSCLE_GROUPS, error: null });
  fake.setTableResult('workout_sets', { data: [], error: null });
  fake.rpc.mockResolvedValue({
    data: { workout_id: '01920000-0000-7000-8000-000000000001', new_prs: [] },
    error: null,
  });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('WorkoutPage', () => {
  /**
   * The draft is read from IndexedDB, and "there is no draft" and "it has not been read
   * yet" look identical. Rendering a fresh workout before the read lands would replace
   * the restored one under the user's hands.
   */
  it('waits for the stored workout to be read instead of starting a new one', () => {
    useWorkoutStore.setState({ draft: null, hydrated: false });

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Cargando el entrenamiento');
    expect(screen.queryByRole('button', { name: 'Nuevo workout' })).not.toBeInTheDocument();
  });

  it('offers to start one when there is nothing open', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Nuevo workout' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('starts a workout that survives on the device', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(draft()?.status).toBe('draft');
    expect(draft()?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('puts a catalogue exercise on screen with the name it goes by', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    await addPressBanca();

    expect(draft()?.exercises).toHaveLength(1);
    expect(draft()?.exercises[0]?.exerciseId).toBe(PRESS_BANCA.id);
    // The card is told the name: the draft only holds the id, because the catalogue is
    // the server's copy and renaming an exercise must not need a migration of sessions.
    expect(await screen.findByText('Press Banca')).toBeInTheDocument();
  });

  /**
   * The end-to-end wiring of T3.8: what the user types in the picker has to become a card
   * *and* a definition in the draft, because the payload is what creates the row on the
   * server and `workout_sets.exercise_id` is a foreign key.
   */
  it('adds an exercise the catalogue does not have, definition and card together', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo ejercicio' }));
    fireEvent.change(screen.getByLabelText('Nombre del ejercicio'), {
      target: { value: 'Press con banda' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(draft()?.customExercises).toHaveLength(1);
    expect(draft()?.customExercises[0]?.name).toBe('Press con banda');
    expect(draft()?.exercises[0]?.exerciseId).toBe(draft()?.customExercises[0]?.id);
    expect(await screen.findByText('Press con banda')).toBeInTheDocument();
  });

  it('freezes the session and queues the write when the workout is finished', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Empuje' } });
    await addPressBanca();

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(draft()?.status).toBe('finished');
    expect(draft()?.endedAt).not.toBeNull();

    // Through the queue and the real dispatcher: this is the same path an offline write
    // takes, not a shortcut to the RPC.
    await vi.waitFor(() => {
      expect(fake.rpc).toHaveBeenCalledWith('save_workout', {
        payload: expect.objectContaining({
          id: draft()?.workoutId,
          title: 'Empuje',
          sets: [],
        }),
      });
    });
  });

  it('counts a rest down when one is asked for', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    fireEvent.click(screen.getByRole('button', { name: 'Descanso' }));

    // Anchored on the colon so it is the countdown and not the button that matched.
    expect(screen.getByText(/^Descanso: /)).toBeInTheDocument();
  });
});

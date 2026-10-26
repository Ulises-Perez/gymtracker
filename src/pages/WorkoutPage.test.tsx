import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { installSaveSync } from '../lib/save-sync.ts';
import { getSupabase } from '../lib/supabase.ts';
import { formatIsoDate } from '../lib/utils.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
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
let uninstallSaveSync: () => void;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workout']}>
      <QueryClientProvider client={client}>
        <WorkoutPage />
      </QueryClientProvider>
    </MemoryRouter>,
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

/**
 * Writes one real set into the first card.
 *
 * The screen refuses to finish a session with nothing recorded, so a test that wants the
 * finalize path has to record something first — the same thing the person does.
 */
function addRecordedSet() {
  const cardId = draft()?.exercises[0]?.id ?? '';

  useWorkoutStore.getState().addSet(cardId, { reps: 5, weightKg: 100 });
}

/**
 * The store write above is not a render. Wait for the row to be on screen before
 * clicking a control whose enabled state is derived from it — otherwise the click
 * lands on the previous render, where "Finalizar" is still disabled.
 */
async function addRecordedSetAndWait() {
  addRecordedSet();

  expect(await screen.findByLabelText('Reps serie 1')).toHaveValue('5');
}

beforeEach(() => {
  // `hydrated` is what the screen waits on, and the store reads it asynchronously.
  // A test that does not care about the wait starts from a read that already happened.
  useWorkoutStore.setState({ draft: null, hydrated: true });

  fake = createFakeSupabase(fakeSession());
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

  /*
   * Installed here because the app installs it at startup (`main.tsx`) and the screen's
   * correctness depends on it: it is what clears the draft the moment a write lands, and
   * therefore what makes a finished draft with an empty queue mean "it did not save" rather
   * than "it may or may not have".
   */
  uninstallSaveSync = installSaveSync(client);
});

afterEach(() => {
  uninstallSaveSync();
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
    await addRecordedSetAndWait();

    // Read before finishing, because a successful write clears the draft: reading it back
    // afterwards would compare the payload against nothing.
    const workoutId = draft()?.workoutId;

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    // Through the queue and the real dispatcher: the same path an offline write takes, not a
    // shortcut to the RPC.
    await vi.waitFor(() => {
      expect(fake.rpc).toHaveBeenCalledWith('save_workout', {
        payload: expect.objectContaining({
          id: workoutId,
          title: 'Empuje',
          exercises: [
            expect.objectContaining({
              exercise_id: PRESS_BANCA.id,
              sets: [expect.objectContaining({ reps: 5, weight_kg: 100 })],
            }),
          ],
          // Zero rather than null is the proof the payload came from the frozen draft:
          // `finish()` is what sets `endedAt`, and the duration is measured from it.
          duration_minutes: 0,
        }),
      });
    });
  });

  /**
   * The gate that no single field can be, and the reason it exists at all: a draft restored from an
   * older build — or from anything else that writes to the store — can hold a value this build
   * refuses. Finishing it would freeze a session whose payload the contract rejects: the save would
   * burn its retries, the draft could no longer be edited, and the only two buttons left would be the
   * same invalid retry and a discard.
   */
  it('refuses to finish a draft that holds a value the save contract would refuse', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();

    // Written into the store directly, the way a draft from an older build arrives: nothing was
    // typed in this session, so no field on screen has had the chance to refuse it.
    const cardId = draft()?.exercises[0]?.id ?? '';
    useWorkoutStore.getState().addSet(cardId, { reps: 10.5, weightKg: 100 });

    // Waited for, so the click below happens against a screen that has the set: a store write made
    // from the test is not a render, and a click before it lands would be read by a stale one.
    expect(await screen.findByLabelText('Reps serie 1')).toHaveValue('10.5');

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    // Told which field it is, by the card's name and the row it is in, and why.
    expect(screen.getByRole('alert')).toHaveTextContent('«Press Banca», serie 1');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Las reps tienen que ser un número entero entre 1 y 1000.',
    );

    // Nothing was frozen and nothing was sent: the draft is still the one being edited.
    expect(draft()?.status).toBe('draft');
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(fake.rpc).not.toHaveBeenCalledWith('save_workout', expect.anything());
  });

  /**
   * The other half of the same gate: correcting the value lets the same tap through, and the warning
   * goes away with it instead of hanging over a session that is fine.
   */
  it('finishes once the refused value is corrected', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();

    const cardId = draft()?.exercises[0]?.id ?? '';
    useWorkoutStore.getState().addSet(cardId, { reps: 10.5, weightKg: 100 });

    // Waited for, so the click below happens against a screen that has the set: a store write made
    // from the test is not a render, and a click before it lands would be read by a stale one.
    expect(await screen.findByLabelText('Reps serie 1')).toHaveValue('10.5');

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('No se puede finalizar');

    // Corrected the way the person would: in the field, which then commits what the contract takes.
    fireEvent.change(await screen.findByLabelText('Reps serie 1'), { target: { value: '10' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    await vi.waitFor(() => {
      expect(fake.rpc).toHaveBeenCalledWith(
        'save_workout',
        expect.objectContaining({
          payload: expect.objectContaining({
            exercises: [expect.objectContaining({ sets: [expect.objectContaining({ reps: 10 })] })],
          }),
        }),
      );
    });
  });

  it('counts a rest down when one is asked for, and lets it be stopped', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    fireEvent.click(screen.getByRole('button', { name: /^Descanso/ }));

    // Anchored on the colon so it is the countdown and not the button that matched.
    expect(screen.getByText(/^Descanso: /)).toBeInTheDocument();

    // The button says how long the rest is, and the same control takes it back.
    fireEvent.click(screen.getByRole('button', { name: 'Detener descanso' }));

    expect(screen.queryByText(/^Descanso: /)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Descanso/ })).toBeInTheDocument();
  });

  /**
   * An accidental "+ Nuevo workout" used to be escapable only by finishing it, and finishing
   * it wrote a workout with no cards. The Inicio counts days by that row, so a mis-tap raised
   * the streak and painted the week. The button stays visible and disabled, and says why.
   */
  it('does not let an empty session be finished', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeDisabled();
    expect(
      screen.getByText('Agregá una serie con reps o kg para finalizar el entrenamiento.'),
    ).toBeInTheDocument();
  });

  it('discards an empty draft without asking, because there is nothing to lose', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    fireEvent.click(screen.getByRole('button', { name: 'Descartar entrenamiento' }));

    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo workout' })).toBeInTheDocument();
  });

  it('asks before discarding a session that has a set in it', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();
    await addRecordedSetAndWait();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar entrenamiento' }));

    expect(screen.getByText('¿Descartar este entrenamiento? Se va a perder.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, descartarlo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByLabelText('Título')).toBeInTheDocument();
  });

  it('celebrates the records the server found', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();
    await addRecordedSetAndWait();

    // Stubbed once the draft exists so the result carries the id of the workout that is
    // really sent: the screen shows a result only when it belongs to this session.
    fake.rpc.mockResolvedValue({
      data: {
        workout_id: draft()?.workoutId,
        new_prs: [
          { exercise_id: PRESS_BANCA.id, old_1rm: 110, new_1rm: 116.7, weight: 100, reps: 5 },
        ],
      },
      error: null,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(await screen.findByText('antes 110,0 kg → 116,7 kg de 1RM')).toBeInTheDocument();
    expect(screen.getByText('Press Banca')).toBeInTheDocument();
  });

  it('says nothing about records when the server found none', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();
    await addRecordedSetAndWait();

    fake.rpc.mockResolvedValue({
      data: { workout_id: draft()?.workoutId, new_prs: [] },
      error: null,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    await vi.waitFor(() => {
      expect(fake.rpc).toHaveBeenCalled();
    });

    // A session that beat nothing gets no celebration: a card that says "0 récords" is
    // worse than no card at all.
    expect(screen.queryByRole('status', { name: 'Récords nuevos' })).not.toBeInTheDocument();
  });

  /**
   * S2: the answer to "did it save?".
   *
   * The date is the one the payload carries and not the clock's -- a session written down on the
   * phone at night and landed the next morning belongs to the night before, which is the day
   * `save_workout` files it under -- and the count is the cards the payload sent, of which there are
   * two here because the same exercise in two blocks is two cards.
   */
  it('says the session was saved, with the date it belongs to and its exercises', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();
    await addRecordedSetAndWait();
    // The second card goes in through the store, which is the same write the picker makes, and keeps
    // the test about what the confirmation counts instead of about finding a name twice in the sheet.
    useWorkoutStore.getState().addExercise(PRESS_BANCA.id);

    const current = useWorkoutStore.getState().draft;

    if (current) {
      useWorkoutStore.setState({ draft: { ...current, date: '2026-03-09' } });
    }

    expect(draft()?.date).toBe('2026-03-09');

    fake.rpc.mockResolvedValue({
      data: { workout_id: draft()?.workoutId, new_prs: [] },
      error: null,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(await screen.findByText('Guardado · 09/03/2026 · 2 ejercicios')).toBeInTheDocument();
    // The way out of the settled screen is the history, not only another session.
    expect(screen.getByRole('link', { name: 'Ver el historial' })).toHaveAttribute(
      'href',
      '/history',
    );
  });

  /**
   * The two halves of the same promise: the confirmation does not depend on there being a record to
   * celebrate, and dismissing the celebration does not take it away -- the panel is the news, the line
   * is the receipt, and only the news can be put down.
   */
  it('keeps the confirmation after the records are dismissed, and counts them', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();
    await addRecordedSetAndWait();

    const savedDate = formatIsoDate(draft()?.date ?? '');

    fake.rpc.mockResolvedValue({
      data: {
        workout_id: draft()?.workoutId,
        new_prs: [
          { exercise_id: PRESS_BANCA.id, old_1rm: 110, new_1rm: 116.7, weight: 100, reps: 5 },
        ],
      },
      error: null,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(
      await screen.findByText(`Guardado · ${savedDate} · 1 ejercicio · 1 récord nuevo`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    expect(screen.queryByRole('status', { name: 'Récords nuevos' })).not.toBeInTheDocument();
    expect(
      screen.getByText(`Guardado · ${savedDate} · 1 ejercicio · 1 récord nuevo`),
    ).toBeInTheDocument();
  });

  /**
   * The other side of S2, and the reason it is written as a state and not as a cheer: a write that is
   * still on its way has not saved anything, and a screen claiming otherwise would be the one lie the
   * whole offline queue exists to avoid.
   */
  it('does not claim a saved session while the write is still queued', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA.id);
    store.finish();

    // Never settles, so the write waits in the queue the way it does for as long as the device is
    // offline.
    fake.rpc.mockImplementation(() => new Promise(() => {}));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await vi.waitFor(() => {
      expect(screen.getByText(/Guardando el entrenamiento/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Guardado · /)).not.toBeInTheDocument();
  });

  /**
   * The other half of the same fact, and the reason the test above is not enough on its own:
   * a successful write clears the draft, so the screen that reports a failure and the screen
   * that reports nothing are different screens. Asserting only that the records appeared would
   * pass just as happily with "no pudimos guardar" written underneath them.
   */
  it('clears the draft once the write lands, instead of reporting a failure', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    await addPressBanca();
    await addRecordedSetAndWait();

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    await vi.waitFor(() => {
      expect(draft()).toBeNull();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo workout' })).toBeInTheDocument();
  });

  /**
   * Defect D2, in the state it actually happened in: the app was reopened after the write
   * failed, so nothing in the queue knows about it any more. The draft is the only witness
   * left, and it has to be enough.
   */
  it('reports a finished workout that nothing is writing, the way a reload leaves it', () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA.id);
    store.finish();

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos guardar el entrenamiento');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('queues the frozen workout again when the retry is asked for', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA.id);
    store.finish();

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // The same payload sent again is safe: `save_workout` replaces the workout's sets rather
    // than appending to them, which is what makes the retry worth offering.
    await vi.waitFor(() => {
      expect(fake.rpc).toHaveBeenCalledWith(
        'save_workout',
        expect.objectContaining({
          payload: expect.objectContaining({
            exercises: [expect.objectContaining({ exercise_id: PRESS_BANCA.id, sets: [] })],
          }),
        }),
      );
    });
  });

  /**
   * A finished draft with nothing queued is a workout the retries gave up on, and the draft is the
   * only copy left. Starting another one replaces it, so the screen has to ask first: telling the
   * user their workout is safe and then throwing it away on a single tap is the one lie this whole
   * finish flow exists to avoid.
   */
  it('asks before replacing a finished workout that nothing saved', () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA.id);
    store.finish();

    const workoutId = draft()?.workoutId;

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    // The question and both answers are on screen, and the draft is untouched until one of them
    // is chosen: a confirmation that replaced first and asked later would be no confirmation.
    expect(screen.getByText(/se va a perder/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, descartarlo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(draft()?.workoutId).toBe(workoutId);
    expect(draft()?.status).toBe('finished');
  });

  it('leaves the finished workout alone when the question is answered with cancel', () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.finish();

    const workoutId = draft()?.workoutId;

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(draft()?.workoutId).toBe(workoutId);
    expect(draft()?.status).toBe('finished');
    // Back to the plain button, so the question can be asked again rather than being stuck open.
    expect(screen.getByRole('button', { name: 'Nuevo workout' })).toBeInTheDocument();
  });

  it('replaces it once losing it is confirmed', () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.finish();

    const lostWorkoutId = draft()?.workoutId;

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartarlo' }));

    expect(draft()?.status).toBe('draft');
    expect(draft()?.workoutId).not.toBe(lostWorkoutId);
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
  });

  /**
   * The other half of the same guard, and the reason it is not simply "always ask": a write that
   * is still queued has already captured the workout as self-describing variables, so replacing
   * the draft loses nothing and a question there would only get in the way.
   */
  it('starts without asking while the finished workout still has a queued write', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA.id);
    store.finish();

    // Never settles, so the write stays in the queue for the whole test, the way it does for the
    // whole time the device is offline.
    fake.rpc.mockImplementation(() => new Promise(() => {}));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await vi.waitFor(() => {
      expect(screen.getByText(/Guardando el entrenamiento/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sí, descartarlo' })).not.toBeInTheDocument();
  });

  it('takes the warning back when the workout ends up queued again', async () => {
    const store = useWorkoutStore.getState();

    store.start();
    store.addExercise(PRESS_BANCA.id);
    store.finish();

    fake.rpc.mockImplementation(() => new Promise(() => {}));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo workout' }));

    expect(screen.getByRole('button', { name: 'Sí, descartarlo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // The write is queued again, so the workout is captured after all and the warning that it would
    // be lost stopped being true. A question left open would tell the user to throw away a session
    // that is on its way to the server.
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sí, descartarlo' })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Nuevo workout' })).toBeInTheDocument();
  });
});

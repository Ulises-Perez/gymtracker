import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { getSupabase } from '../../lib/supabase.ts';
import { createFakeSupabase } from '../../testing/fake-supabase.ts';
import type { WorkoutExerciseDraft } from '../../stores/workout-store.ts';
import { WorkoutExerciseCard } from './WorkoutExerciseCard.tsx';

vi.mock('../../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const EXERCISE_ID = '01920000-0000-7000-8000-000000000010';

/** The last session: 10 reps at 70 kg, then 8 at 75. */
const LAST_SESSION = [
  { set_number: 1, reps: 10, weight_kg: '70.00' },
  { set_number: 2, reps: 8, weight_kg: '75.00' },
];

function cardWith(sets: WorkoutExerciseDraft['sets']): WorkoutExerciseDraft {
  return { id: 'card-1', exerciseId: EXERCISE_ID, sets };
}

function setWith(overrides: Partial<WorkoutExerciseDraft['sets'][number]> = {}) {
  return {
    id: 'set-1',
    reps: 5,
    weightKg: 100,
    rpe: null,
    isWarmup: false,
    notes: null,
    ...overrides,
  };
}

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function renderCard(card: WorkoutExerciseDraft, name = 'Press Banca') {
  const handlers = {
    onAddSet: vi.fn(),
    onUpdateSet: vi.fn(),
    onRemoveSet: vi.fn(),
    onRemoveExercise: vi.fn(),
  };

  render(
    <QueryClientProvider client={client}>
      <WorkoutExerciseCard name={name} card={card} {...handlers} />
    </QueryClientProvider>,
  );

  return handlers;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.rpc.mockResolvedValue({ data: LAST_SESSION, error: null });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('WorkoutExerciseCard', () => {
  it('names the exercise it belongs to', () => {
    renderCard(cardWith([]));

    expect(screen.getByRole('heading', { name: 'Press Banca' })).toBeInTheDocument();
  });

  it('shows what each set already holds', () => {
    renderCard(cardWith([setWith({ reps: 5, weightKg: 100 })]));

    expect(screen.getByLabelText('Reps serie 1')).toHaveValue('5');
    expect(screen.getByLabelText('Peso en kg serie 1')).toHaveValue('100');
  });

  /**
   * The reference the plan asks for on the card. It is read from the RPC that
   * returns the sets of the most recent workout that used this exercise, so a drop
   * set shows up as itself instead of being summarised into one number.
   */
  it('shows what was lifted last time', async () => {
    renderCard(cardWith([]));

    expect(await screen.findByText('último: 10 × 70 kg · 8 × 75 kg')).toBeInTheDocument();
  });

  it('says nothing about last time when there is no history', async () => {
    fake.rpc.mockResolvedValue({ data: [], error: null });

    renderCard(cardWith([]));

    await waitFor(() => {
      expect(screen.queryByText(/^último:/)).not.toBeInTheDocument();
    });
  });

  /**
   * The default the plan asks for: the first set of a card starts from what the
   * exercise ended on last session, which is the same weight the user is about to
   * lift again.
   */
  it('seeds the first set from the last session', async () => {
    const { onAddSet } = renderCard(cardWith([]));

    await screen.findByText(/^último:/);
    fireEvent.click(screen.getByRole('button', { name: '+ serie' }));

    expect(onAddSet).toHaveBeenCalledWith({ reps: 8, weightKg: 75 });
  });

  /**
   * From the second set on, the reference is the set just above: repeating the
   * same weight is the common case, and it saves two taps per set. Warmup is
   * deliberately not inherited — the warmups come first, so a new set is a work
   * set unless the user says otherwise.
   */
  it('seeds a later set from the set above it', () => {
    const { onAddSet } = renderCard(
      cardWith([setWith({ reps: 5, weightKg: 100, isWarmup: true })]),
    );

    fireEvent.click(screen.getByRole('button', { name: '+ serie' }));

    expect(onAddSet).toHaveBeenCalledWith({ reps: 5, weightKg: 100 });
  });

  /**
   * Weights in Argentina are written with a comma, and a `type="number"` input
   * refuses that outright — it reports an empty value — which is why these fields
   * are text inputs with a decimal keyboard and the parsing lives in
   * `parseDecimalInput`.
   */
  it('commits a weight typed with a decimal comma', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith({ weightKg: 100 })]));

    fireEvent.change(screen.getByLabelText('Peso en kg serie 1'), { target: { value: '72,5' } });

    expect(onUpdateSet).toHaveBeenCalledWith('set-1', { weightKg: 72.5 });
  });

  it('commits reps as typed', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith({ reps: 5 })]));

    fireEvent.change(screen.getByLabelText('Reps serie 1'), { target: { value: '12' } });

    expect(onUpdateSet).toHaveBeenCalledWith('set-1', { reps: 12 });
  });

  it('means "no value" rather than zero when a field is emptied', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith()]));

    fireEvent.change(screen.getByLabelText('Peso en kg serie 1'), { target: { value: '' } });

    // `Number('')` is 0, which would turn a skipped field into a 0 kg set.
    expect(onUpdateSet).toHaveBeenCalledWith('set-1', { weightKg: null });
  });

  it('ignores what is not a number instead of writing NaN into the draft', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith()]));

    fireEvent.change(screen.getByLabelText('Peso en kg serie 1'), { target: { value: 'abc' } });

    expect(onUpdateSet).toHaveBeenCalledWith('set-1', { weightKg: null });
  });

  it('labels the inputs of each set apart, so a screen reader can tell them apart', () => {
    renderCard(cardWith([setWith({ id: 'set-1' }), setWith({ id: 'set-2' })]));

    expect(screen.getByLabelText('Reps serie 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Peso en kg serie 2')).toBeInTheDocument();
  });

  it('removes a single set by its id', () => {
    const { onRemoveSet } = renderCard(cardWith([setWith({ id: 'set-7' })]));

    fireEvent.click(screen.getByRole('button', { name: 'Borrar serie 1' }));

    expect(onRemoveSet).toHaveBeenCalledWith('set-7');
  });

  it('removes the whole exercise from the card header', () => {
    const { onRemoveExercise } = renderCard(cardWith([setWith()]));

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Press Banca' }));

    expect(onRemoveExercise).toHaveBeenCalledTimes(1);
  });

  it('shows the sets it was given, in order', () => {
    renderCard(
      cardWith([
        setWith({ id: 'set-1', reps: 10, weightKg: 60 }),
        setWith({ id: 'set-2', reps: 8, weightKg: 65 }),
      ]),
    );

    const list = screen.getByRole('list', { name: 'Series de Press Banca' });
    const rows = within(list).getAllByRole('listitem');

    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByLabelText('Reps serie 1')).toHaveValue('10');
    expect(within(rows[1] as HTMLElement).getByLabelText('Reps serie 2')).toHaveValue('8');
  });
});

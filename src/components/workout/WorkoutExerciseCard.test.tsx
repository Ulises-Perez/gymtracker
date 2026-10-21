import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { getSupabase } from '../../lib/supabase.ts';
import { createFakeSupabase } from '../../testing/fake-supabase.ts';
import { writingGap } from '../../testing/ruled-field.ts';
import type { WorkoutExerciseDraft } from '../../stores/workout-store.ts';
import { WorkoutExerciseCard } from './WorkoutExerciseCard.tsx';

/** The column template of a grid, which is what keeps the header and the rows lined up. */
function columnsOf(element: HTMLElement): string | undefined {
  return /grid-cols-\[[^\]]+\]/.exec(element.className)?.[0];
}

vi.mock('../../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const EXERCISE_ID = '01920000-0000-7000-8000-000000000010';

/** The last session: 10 reps at 70 kg, then 8 at 75. */
const LAST_SESSION = [
  { set_number: 1, reps: 10, weight_kg: '70.00' },
  { set_number: 2, reps: 8, weight_kg: '75.00' },
];

function cardWith(sets: WorkoutExerciseDraft['sets']): WorkoutExerciseDraft {
  return {
    id: 'card-1',
    exerciseId: EXERCISE_ID,
    sets,
  };
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
  /**
   * The card does not open with an objective anymore: it opens with the series. The three fields
   * that asked for a target — the reps it aimed for and the range of weights — are gone, and what
   * is left is what the person actually lifted: the reps and the kilos, one row per series.
   */
  it('asks for the series and for nothing else', () => {
    renderCard(cardWith([setWith({ reps: 5, weightKg: 100 })]));

    expect(screen.queryByLabelText('Reps del objetivo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Peso mínimo del objetivo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Peso máximo del objetivo')).not.toBeInTheDocument();
    expect(screen.queryByText('Objetivo (opcional)')).not.toBeInTheDocument();

    // What is left: the reps and the kilos of the series, which is what the card is for.
    expect(screen.getByLabelText('Reps serie 1')).toHaveValue('5');
    expect(screen.getByLabelText('Peso en kg serie 1')).toHaveValue('100');
  });

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
   * The reference the plan asks for on the card, read from the RPC that returns the sets of the most
   * recent workout that used this exercise. It is summarised to the heaviest set: the plan asked for
   * every set so that a drop set would read as itself, and the line grew long enough to stop being
   * read, which is the opposite of what it was for.
   */
  it('shows what was lifted last time', async () => {
    renderCard(cardWith([]));

    expect(await screen.findByText('último: 8 × 75 kg')).toBeInTheDocument();
  });

  /**
   * The heaviest set and not the last one, which is the whole difference from what this line used to
   * do. A session that ends lighter than it started still has a best set, and that is the number the
   * user is about to try to beat.
   */
  it('shows the heaviest set of last time, not the last one', async () => {
    fake.rpc.mockResolvedValue({
      data: [
        { set_number: 1, reps: 5, weight_kg: '80.00' },
        { set_number: 2, reps: 12, weight_kg: '40.00' },
      ],
      error: null,
    });

    renderCard(cardWith([]));

    expect(await screen.findByText('último: 5 × 80 kg')).toBeInTheDocument();
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

  /**
   * The save contract refuses fractional reps, so the field must not put one in the draft: a value the
   * contract refuses is refused at the moment it is typed, where it can still be corrected, and not
   * after "Finalizar" has already frozen the session.
   *
   * The text stays exactly as typed, because it is what the person is looking at while they correct
   * it; the stored value keeps the last one the rule accepted, and the message is what says that
   * what is on screen is not what is recorded yet.
   */
  it('refuses reps that are not a whole number, and says why next to the field', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith({ reps: 5 })]));

    const reps = screen.getByLabelText('Reps serie 1');
    fireEvent.change(reps, { target: { value: '10,5' } });

    expect(onUpdateSet).not.toHaveBeenCalled();
    // Not only colour: the words, and the wiring that announces them, like every field's error.
    expect(reps).toHaveAccessibleDescription(
      'Las reps tienen que ser un número entero mayor que cero.',
    );
    expect(reps).toHaveAttribute('aria-invalid', 'true');
    expect(reps).toHaveValue('10,5');
  });

  /**
   * The other number the contract refuses. A negative weight is not a set anyone performed, and it
   * would be refused by the save after the draft was already frozen.
   */
  it('refuses a negative weight, and says why next to the field', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith({ weightKg: 100 })]));

    const weight = screen.getByLabelText('Peso en kg serie 1');
    fireEvent.change(weight, { target: { value: '-5' } });

    expect(onUpdateSet).not.toHaveBeenCalled();
    expect(weight).toHaveAccessibleDescription('El peso no puede ser negativo.');
    expect(weight).toHaveValue('-5');
  });

  /** A refusal is a moment, not a state the field keeps: fixing it commits the value and says nothing. */
  it('takes the refusal back once the value is corrected', () => {
    const { onUpdateSet } = renderCard(cardWith([setWith({ reps: 5 })]));

    const reps = screen.getByLabelText('Reps serie 1');
    fireEvent.change(reps, { target: { value: '0' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(reps, { target: { value: '12' } });

    expect(onUpdateSet).toHaveBeenCalledWith('set-1', { reps: 12 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(reps).not.toHaveAttribute('aria-invalid');
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

  /**
   * The memorable moment of the world: you correct a weight you had already written, and the one you
   * replaced stays there, crossed out, where it was. It is the notebook's own mark, and the only thing
   * on the screen that says "this was wrong and it got fixed" without saying a word.
   */
  it('keeps the value it replaced, struck through, when a set is corrected', () => {
    renderCard(cardWith([setWith({ reps: 5, weightKg: 100 })]));

    const weight = screen.getByLabelText('Peso en kg serie 1');

    // Tapping the field is what takes hold of the value; the correction happens in the typing.
    fireEvent.focus(weight);
    fireEvent.change(weight, { target: { value: '102,5' } });

    expect(screen.getByText('100', { selector: 's' })).toBeInTheDocument();
    expect(weight).toHaveValue('102,5');

    /*
     * And what is crossed is the value it replaced, not every keystroke on the way: from 100, typing
     * 102,5 passes through "1" and "10", and marking those would be marking typing instead of
     * correcting. One mark, the one that was really there.
     */
    fireEvent.change(weight, { target: { value: '1' } });

    expect(screen.getAllByText('100', { selector: 's' })).toHaveLength(1);
  });

  /**
   * Nothing was replaced, so nothing is crossed out. The mark is the record of a correction, not a
   * decoration the row always carries -- and on an untouched row it would be a number that was never
   * written there.
   */
  it('crosses out nothing on a row that was never corrected', () => {
    renderCard(cardWith([setWith({ reps: 5, weightKg: 100 })]));

    const list = screen.getByRole('list', { name: 'Series de Press Banca' });

    expect(list.querySelector('s')).toBeNull();
  });

  /**
   * The crossed value is the one the hand wrote, with the decimal comma that weights are written with
   * here -- the rest of the app prints `67.5`, and this one number does not, because it is a record of
   * what somebody typed. And it is announced, not only seen: whoever cannot look at the crossing is
   * exactly who would lose the number.
   */
  it('announces what it crossed out, and keeps the comma it was written with', () => {
    renderCard(cardWith([setWith({ weightKg: 67.5 })]));

    const weight = screen.getByLabelText('Peso en kg serie 1');

    fireEvent.focus(weight);
    fireEvent.change(weight, { target: { value: '70' } });

    expect(screen.getByText('Valor anterior:')).toHaveClass('sr-only');
    expect(screen.getByText('67,5', { selector: 's' })).toBeInTheDocument();
  });

  /**
   * Four series used to reprint `Reps` and `kg` on every row: eight labels saying the same two words,
   * and around 290px of scroll in an app whose promise is to log a set in under ten seconds. The
   * columns are printed once, like the head of a ruled page, and a series is one line of writing.
   */
  it('prints the column labels once per card, not once per set', () => {
    renderCard(
      cardWith(
        [1, 2, 3, 4].map((position) => setWith({ id: `set-${position}`, reps: 8, weightKg: 70 })),
      ),
    );

    expect(screen.getAllByText('Reps')).toHaveLength(1);
    expect(screen.getAllByText('kg')).toHaveLength(1);
  });

  /**
   * A card with no series has no columns to label. Two words printed over the "+ serie" button -- the
   * only thing an empty card shows -- would be a header for nothing.
   */
  it('prints no column labels on a card that has no series yet', () => {
    renderCard(cardWith([]));

    expect(screen.queryByText('Reps')).not.toBeInTheDocument();
    expect(screen.queryByText('kg')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ serie' })).toBeInTheDocument();
  });

  /**
   * The labels are a header, not part of a row, and the header and the rows share one column
   * template -- which is the only reason the values line up under the words that name them. The
   * template is the design's own: the margin's number, the reps, the kilos and the delete, whose
   * column is 44px because the button inherits its width from it.
   */
  it('lines the printed header up with the columns of the rows', () => {
    renderCard(cardWith([setWith({ id: 'set-1' }), setWith({ id: 'set-2' })]));

    const list = screen.getByRole('list', { name: 'Series de Press Banca' });
    const header = screen.getByText('Reps').closest('[class*="grid-cols-"]') as HTMLElement | null;

    // The label belongs to the card, not to a series, so it is not inside a row.
    expect(within(list).queryByText('Reps')).not.toBeInTheDocument();

    expect(header).not.toBeNull();
    expect(columnsOf(header as HTMLElement)).toBe('grid-cols-[1.25rem_1fr_1fr_2.75rem]');

    for (const row of within(list).getAllByRole('listitem')) {
      expect(columnsOf(row)).toBe(columnsOf(header as HTMLElement));
    }
  });

  /**
   * A set is one ruled line: the number in the margin, the reps, the kilos and the delete, on the
   * line that closes the row -- the same line the detail screen draws under "1ª · 8 × 70.0 kg". The
   * field prints no second rule of its own, and the writing ends on the line instead of floating in
   * the middle of the 48px touch target.
   */
  it('sits the value of a set on the rule that closes its row', () => {
    renderCard(cardWith([setWith({ reps: 5, weightKg: 100 })]));

    const row = screen.getByRole('listitem');
    const reps = within(row).getByLabelText('Reps serie 1');

    // One rule per row, drawn by the row: the field is that line and does not draw another one.
    expect(row).toHaveClass('border-b');
    expect(reps).not.toHaveClass('border-b');
    expect(reps).toHaveClass('min-h-12');
    expect(writingGap(reps)).toBeLessThanOrEqual(4);
  });
});

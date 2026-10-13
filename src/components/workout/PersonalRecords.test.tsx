import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NewPersonalRecord } from '../../schemas/workout.ts';
import { PersonalRecords } from './PersonalRecords.tsx';

const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';
const SENTADILLA = '01920000-0000-7000-8000-0000000000a2';

const names = new Map([
  [PRESS_BANCA, 'Press Banca'],
  [SENTADILLA, 'Sentadilla'],
]);

function record(overrides: Partial<NewPersonalRecord> = {}): NewPersonalRecord {
  return {
    exercise_id: PRESS_BANCA,
    old_1rm: 110,
    new_1rm: 116.7,
    weight: 100,
    reps: 5,
    ...overrides,
  };
}

function renderRecords(records: NewPersonalRecord[]) {
  const onDismiss = vi.fn();

  render(<PersonalRecords records={records} names={names} onDismiss={onDismiss} />);

  return { onDismiss };
}

/**
 * What `save_workout` returns is the one thing the user cannot work out for themselves:
 * the server compares the new marks against the stored records and says what moved. The
 * screen's job is to say it back in Spanish, without inventing a previous mark where
 * there was none.
 */
describe('PersonalRecords', () => {
  it('says which lift it was and what it beat', () => {
    renderRecords([record()]);

    expect(screen.getByRole('status', { name: 'Récords nuevos' })).toBeInTheDocument();
    expect(screen.getByText('Press Banca')).toBeInTheDocument();
    expect(screen.getByText('antes 110.0 kg → 116.7 kg de 1RM')).toBeInTheDocument();
  });

  /**
   * A first-ever record has no previous value, and `old_1rm` arrives as null rather than
   * zero. Printing "0.0 kg" would be a claim about a number nobody lifted.
   */
  it('does not invent a previous mark for a first-ever record', () => {
    renderRecords([record({ old_1rm: null })]);

    expect(screen.getByText('primera marca: 116.7 kg de 1RM')).toBeInTheDocument();
    expect(screen.queryByText(/110\.0/)).not.toBeInTheDocument();
  });

  /**
   * The field is `nullish`, so a key that never arrived is a first-ever record too. The
   * typechecker is what pointed this out: guarding only for null left the other absence
   * on a path towards `toFixed`.
   */
  it('treats a missing previous mark the same as a null one', () => {
    renderRecords([record({ old_1rm: undefined })]);

    expect(screen.getByText('primera marca: 116.7 kg de 1RM')).toBeInTheDocument();
  });

  it('lists every record of the session', () => {
    renderRecords([
      record(),
      record({
        exercise_id: SENTADILLA,
        old_1rm: null,
        new_1rm: 140.3,
        weight: 130,
        reps: 3,
      }),
    ]);

    expect(screen.getByText('Press Banca')).toBeInTheDocument();
    expect(screen.getByText('Sentadilla')).toBeInTheDocument();
  });

  it('says nothing when there is nothing to celebrate', () => {
    renderRecords([]);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  /**
   * Pins that the animation is attached to the element, not what the stylesheet says: a
   * class that quietly disappears takes the animation with it, and nothing else in the
   * suite would notice. The `prefers-reduced-motion` guard is CSS and is not observable
   * from here.
   */
  it('arrives with the animation attached', () => {
    renderRecords([record()]);

    expect(screen.getByRole('status', { name: 'Récords nuevos' })).toHaveClass('pr-arrive');
  });

  it('can be dismissed', () => {
    const { onDismiss } = renderRecords([record()]);

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /** The name is looked up, and an id the catalogue does not know is not a name. */
  it('falls back to a generic name instead of showing an id', () => {
    renderRecords([record({ exercise_id: '01920000-0000-7000-8000-0000000000ff' })]);

    expect(screen.getByText('Ejercicio')).toBeInTheDocument();
  });
});

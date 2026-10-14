import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { getSupabase } from '../../lib/supabase.ts';
import type { WorkoutExerciseDraft } from '../../stores/workout-store.ts';
import { createFakeSupabase } from '../../testing/fake-supabase.ts';
import { SortableExerciseList } from './SortableExerciseList.tsx';

vi.mock('../../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const CARDS: WorkoutExerciseDraft[] = [
  {
    id: 'card-1',
    exerciseId: 'ex-1',
    sets: [],
    targetReps: null,
    targetWeightMin: null,
    targetWeightMax: null,
  },
  {
    id: 'card-2',
    exerciseId: 'ex-2',
    sets: [],
    targetReps: null,
    targetWeightMin: null,
    targetWeightMax: null,
  },
];

const names = new Map([
  ['ex-1', 'Press Banca'],
  ['ex-2', 'Sentadilla'],
]);

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

/**
 * What can be asserted here, and what cannot.
 *
 * A drag and a swipe are pointer interactions: dnd-kit measures the layout of the elements it is
 * reordering and jsdom reports every rectangle as zero, so a synthesised drag would exercise the
 * harness rather than the gesture. The arithmetic behind both lives in `lib/gestures.ts` and is
 * tested there. What is left for this file is the wiring a mistake would be invisible in: that
 * every card is rendered with the right name, that each one offers a handle and a way out, and
 * that the callbacks are handed the id of the card they came from.
 */
function renderList() {
  const handlers = {
    onReorder: vi.fn(),
    onAddSet: vi.fn(),
    onUpdateSet: vi.fn(),
    onRemoveSet: vi.fn(),
    onRemoveExercise: vi.fn(),
    onSetTarget: vi.fn(),
  };

  render(
    <QueryClientProvider client={client}>
      <SortableExerciseList cards={CARDS} names={names} {...handlers} />
    </QueryClientProvider>,
  );

  return handlers;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.setTableResult('workout_sets', { data: [], error: null });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('SortableExerciseList', () => {
  it('renders every exercise, in the order the draft holds them', () => {
    renderList();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual(['Press Banca', 'Sentadilla']);
  });

  it('gives each card a handle that says which exercise it moves', () => {
    renderList();

    expect(screen.getByRole('button', { name: 'Mover Press Banca' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover Sentadilla' })).toBeInTheDocument();
  });

  /**
   * The gesture is an addition, never the only way out. A card whose sole exit were a horizontal
   * swipe would be unusable with a keyboard and unreachable for anyone who cannot perform it, and
   * this is the button that keeps it from being that.
   */
  it('leaves a way out that is not a gesture', () => {
    renderList();

    expect(screen.getByRole('button', { name: 'Quitar Press Banca' })).toBeInTheDocument();
  });

  it('hands each card the id it belongs to, not the position it happens to be in', () => {
    const handlers = renderList();

    fireEvent.click(screen.getAllByRole('button', { name: '+ serie' })[1] as HTMLElement);

    // A wrapper that passed the index instead of the id would work until the list was reordered,
    // and then quietly add a set to the wrong exercise.
    expect(handlers.onAddSet.mock.calls[0]?.[0]).toBe('card-2');
  });

  it('lets a card be removed through its own button', () => {
    const handlers = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Sentadilla' }));

    expect(handlers.onRemoveExercise).toHaveBeenCalledWith('card-2');
  });
});

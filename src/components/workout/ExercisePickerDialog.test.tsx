import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { getSupabase } from '../../lib/supabase.ts';
import { createFakeSupabase } from '../../testing/fake-supabase.ts';
import { ExercisePickerDialog } from './ExercisePickerDialog.tsx';

vi.mock('../../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';

const PRESS_BANCA = {
  id: 'ex-1',
  name: 'Press Banca',
  muscle_group_id: 'mg-pecho',
  is_custom: false,
};

/** The accent is the point of this one: nobody types it mid-set on a phone. */
const EXTENSION = {
  id: 'ex-2',
  name: 'Extensión en Polea',
  muscle_group_id: 'mg-triceps',
  is_custom: false,
};

const PAJAROS = {
  id: 'ex-3',
  name: 'Pájaros',
  muscle_group_id: 'mg-hombros',
  is_custom: false,
};

const MUSCLE_GROUPS = [
  { id: 'mg-pecho', name: 'Pecho', icon: null },
  { id: 'mg-triceps', name: 'Tríceps', icon: null },
  { id: 'mg-hombros', name: 'Hombros', icon: null },
  // Deliberately empty: the seed shipped groups like this (M5) and a filter chip
  // that leads to an empty list is worse than no chip.
  { id: 'mg-cardio', name: 'Cardio', icon: null },
];

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

type PickerOptions = {
  open?: boolean;
  userId?: string;
};

function renderPicker({ open = true, userId = USER_ID }: PickerOptions = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <QueryClientProvider client={client}>
      <ExercisePickerDialog
        open={open}
        onOpenChange={onOpenChange}
        userId={userId}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );

  return { onSelect, onOpenChange };
}

const search = () => screen.getByLabelText('Buscar');

/** Names of the exercises currently offered, in order. */
async function offeredNames(): Promise<string[]> {
  const list = await screen.findByRole('list', { name: 'Ejercicios' });

  return [...list.querySelectorAll('button')].map((button) => button.textContent ?? '');
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('exercises', { data: [PRESS_BANCA, EXTENSION, PAJAROS], error: null });
  fake.setTableResult('muscle_groups', { data: MUSCLE_GROUPS, error: null });

  client = createQueryClient();
  // A failing catalogue is a case under test; three retries would only make the
  // suite slower without testing anything the retry policy adds.
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('ExercisePickerDialog', () => {
  it('stays out of the way while it is closed', () => {
    renderPicker({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the catalogue once it arrives', async () => {
    renderPicker();

    expect(await offeredNames()).toEqual(['Press Banca', 'Extensión en Polea', 'Pájaros']);
  });

  it('shows skeletons, not a spinner, while the catalogue is on its way', async () => {
    vi.mocked(getSupabase).mockReturnValue(new Promise(() => {}));

    renderPicker();

    // The status region is what a screen reader hears; the skeletons themselves
    // are hidden from it on purpose.
    expect(screen.getByRole('status', { name: 'Cargando ejercicios' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ejercicios' })).not.toBeInTheDocument();
  });

  it('finds the exercise when the accents are not typed', async () => {
    renderPicker();
    await offeredNames();

    fireEvent.change(search(), { target: { value: 'extension' } });

    await waitFor(async () => {
      expect(await offeredNames()).toEqual(['Extensión en Polea']);
    });
  });

  it('still finds it when the accents are typed', async () => {
    renderPicker();
    await offeredNames();

    fireEvent.change(search(), { target: { value: 'Pájaros' } });

    await waitFor(async () => {
      expect(await offeredNames()).toEqual(['Pájaros']);
    });
  });

  it('survives a typo, which is the reason fuse is here at all', async () => {
    renderPicker();
    await offeredNames();

    fireEvent.change(search(), { target: { value: 'sentadilla' } });

    await waitFor(async () => {
      expect(await offeredNames()).toEqual([]);
    });

    fireEvent.change(search(), { target: { value: 'press bnaca' } });

    await waitFor(async () => {
      expect(await offeredNames()).toEqual(['Press Banca']);
    });
  });

  it('narrows the list to one muscle group', async () => {
    renderPicker();
    await offeredNames();

    const triceps = screen.getByRole('button', { name: 'Tríceps' });
    fireEvent.click(triceps);

    await waitFor(async () => {
      expect(await offeredNames()).toEqual(['Extensión en Polea']);
    });
    // The chosen filter says so, for the eye and for assistive technology.
    expect(screen.getByRole('button', { name: 'Tríceps', pressed: true })).toBeInTheDocument();
  });

  it('combines the search with the group filter', async () => {
    renderPicker();
    await offeredNames();

    fireEvent.click(screen.getByRole('button', { name: 'Tríceps' }));
    fireEvent.change(search(), { target: { value: 'press' } });

    // "Press Banca" matches the search but is not in Tríceps, so it must not
    // sneak back in through the search.
    await waitFor(async () => {
      expect(await offeredNames()).toEqual([]);
    });
  });

  it('does not offer a filter that leads nowhere', async () => {
    renderPicker();
    await offeredNames();

    expect(screen.queryByRole('button', { name: 'Cardio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pecho' })).toBeInTheDocument();
  });

  it('hands the chosen exercise over and closes', async () => {
    const { onSelect, onOpenChange } = renderPicker();

    fireEvent.click(await screen.findByRole('button', { name: 'Press Banca' }));

    expect(onSelect).toHaveBeenCalledWith({
      id: 'ex-1',
      name: 'Press Banca',
      muscleGroupId: 'mg-pecho',
      isCustom: false,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says so when the search matches nothing', async () => {
    renderPicker();
    await offeredNames();

    fireEvent.change(search(), { target: { value: 'zzzzzz' } });

    expect(
      await screen.findByText('No encontramos ejercicios con ese nombre.'),
    ).toBeInTheDocument();
  });

  it('says so when the catalogue is empty', async () => {
    fake.setTableResult('exercises', { data: [], error: null });

    renderPicker();

    expect(await screen.findByText('Todavía no hay ejercicios disponibles.')).toBeInTheDocument();
  });

  it('reports a failed catalogue in Spanish instead of looking empty', async () => {
    fake.setTableResult('exercises', { data: null, error: { message: 'permission denied' } });

    renderPicker();

    // An empty list and a denied query look identical on screen unless the error
    // is said out loud.
    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('No pudimos cargar los ejercicios');
  });
});

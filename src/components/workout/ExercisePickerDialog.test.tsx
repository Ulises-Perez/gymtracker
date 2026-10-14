import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { getSupabase } from '../../lib/supabase.ts';
import type { CatalogExercise } from '../../lib/catalog-api.ts';
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
  // In the order the server returns them — `fetchCatalog` sorts by name — because the picker
  // now shows the groups as sections in the order they arrive. A fixture in another order
  // would have made the test assert a layout production never produces.
  { id: 'mg-hombros', name: 'Hombros', icon: null },
  { id: 'mg-pecho', name: 'Pecho', icon: null },
  { id: 'mg-triceps', name: 'Tríceps', icon: null },
  // Deliberately empty: the seed shipped groups like this (M5) and a filter chip
  // that leads to an empty list is worse than no chip.
  { id: 'mg-cardio', name: 'Cardio', icon: null },
];

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

type PickerOptions = {
  open?: boolean;
  userId?: string;
  localExercises?: CatalogExercise[];
};

function renderPicker({
  open: initiallyOpen = true,
  userId = USER_ID,
  localExercises,
}: PickerOptions = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const onCreateCustom = vi.fn();

  /*
   * Genuinely controlled, with a way back in. A stub that only records the call would
   * let the dialog stay open after a choice, and the state it keeps while hidden —
   * the thing the reset below is about — could never be observed.
   */
  function Harness() {
    const [open, setOpen] = useState(initiallyOpen);

    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Reabrir
        </button>
        <ExercisePickerDialog
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
          userId={userId}
          onSelect={onSelect}
          onCreateCustom={onCreateCustom}
          localExercises={localExercises}
        />
      </>
    );
  }

  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );

  return { onSelect, onOpenChange, onCreateCustom };
}

const search = () => screen.getByLabelText('Buscar');

/**
 * Names of the exercises currently offered, in the order they appear.
 *
 * It waits for the catalogue rather than for a list, and that is not the same thing any more:
 * with the exercises grouped into sections, nothing matching means the picker legitimately
 * renders no list at all, so an assertion that waited for one would sit there until it timed
 * out. Reading the lists after the skeletons are gone is what "the results have settled" means.
 */
async function offeredNames(): Promise<string[]> {
  await waitFor(() => {
    expect(screen.queryByRole('status', { name: 'Cargando ejercicios' })).not.toBeInTheDocument();
  });

  return screen
    .queryAllByRole('list')
    .flatMap((list) =>
      [...list.querySelectorAll('button')].map((button) => button.textContent ?? ''),
    );
}

/** The headings the sections are titled with, in the order they are shown. */
async function sectionNames(): Promise<string[]> {
  await offeredNames();

  return screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent ?? '');
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

  it('lists every exercise in the catalogue, grouped by section', async () => {
    renderPicker();

    expect(await offeredNames()).toEqual(['Pájaros', 'Press Banca', 'Extensión en Polea']);
  });

  it('groups the exercises into the section of their muscle group', async () => {
    renderPicker();

    /*
     * The groups in the order the catalogue gives them, which arrives alphabetical: Hombros,
     * Pecho, Tríceps. Within a section the exercises keep the order the catalogue gave them, so
     * the sections do not jump around as the search narrows.
     */
    expect(await sectionNames()).toEqual(['Hombros', 'Pecho', 'Tríceps']);
    expect(await offeredNames()).toEqual(['Pájaros', 'Press Banca', 'Extensión en Polea']);

    // And each one is *inside* its group, which is what "by sections" has to mean: a heading
    // with its exercises filed under the next one would look right and be wrong.
    const triceps = await screen.findByRole('list', { name: 'Tríceps' });

    expect([...triceps.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Extensión en Polea',
    ]);
  });

  it('gives the exercises with no group a section of their own, at the end', async () => {
    renderPicker({
      localExercises: [
        { id: 'local-1', name: 'Press con banda', muscleGroupId: null, isCustom: true },
      ],
    });

    // A custom exercise can be created without a group, and a section list that left those out
    // would hide them from the only screen that can put them in a workout.
    expect(await sectionNames()).toEqual(['Hombros', 'Pecho', 'Tríceps', 'Sin grupo']);
    expect(await offeredNames()).toContain('Press con banda');
  });

  it('keeps only the sections that have a match while searching', async () => {
    renderPicker();
    await offeredNames();

    fireEvent.change(search(), { target: { value: 'extension' } });

    await waitFor(async () => {
      expect(await sectionNames()).toEqual(['Tríceps']);
    });
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

const CREATE_TOGGLE = 'Nuevo ejercicio';
const NAME_LABEL = 'Nombre del ejercicio';
const GROUP_LABEL = 'Grupo muscular';

async function openCreateForm() {
  fireEvent.click(await screen.findByRole('button', { name: CREATE_TOGGLE }));
}

describe('inventing an exercise the catalogue does not have', () => {
  it('keeps the form out of the way until it is asked for', async () => {
    renderPicker();
    await offeredNames();

    expect(screen.queryByLabelText(NAME_LABEL)).not.toBeInTheDocument();

    await openCreateForm();

    expect(screen.getByLabelText(NAME_LABEL)).toBeInTheDocument();
  });

  it('hands over the name and the chosen muscle group', async () => {
    const { onCreateCustom, onOpenChange } = renderPicker();
    await offeredNames();
    await openCreateForm();

    fireEvent.change(screen.getByLabelText(NAME_LABEL), {
      target: { value: '  Press con banda  ' },
    });
    fireEvent.change(screen.getByLabelText(GROUP_LABEL), { target: { value: 'mg-pecho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    // Trimmed here and not downstream: the schema and 0008 both refuse a blank name,
    // and padding around a real one would otherwise be stored as typed.
    expect(onCreateCustom).toHaveBeenCalledWith('Press con banda', 'mg-pecho');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('creates it with no group when none is chosen', async () => {
    const { onCreateCustom } = renderPicker();
    await offeredNames();
    await openCreateForm();

    fireEvent.change(screen.getByLabelText(NAME_LABEL), { target: { value: 'Press con banda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(onCreateCustom).toHaveBeenCalledWith('Press con banda', null);
  });

  it('refuses to create one without a name', async () => {
    const { onCreateCustom } = renderPicker();
    await offeredNames();
    await openCreateForm();

    const create = screen.getByRole('button', { name: 'Crear' });
    expect(create).toBeDisabled();

    // Whitespace is not a name. This is the only place that can stop an unsavable
    // exercise from reaching the draft, where the user would meet it at "Finalizar".
    fireEvent.change(screen.getByLabelText(NAME_LABEL), { target: { value: '   ' } });
    fireEvent.click(create);

    expect(onCreateCustom).not.toHaveBeenCalled();
  });

  /**
   * Creating is local. The catalogue is the server's copy, and needing it reachable
   * in order to invent an exercise would remove the one thing the app promises when
   * offline -- which is exactly when a catalogue request fails.
   */
  it('still allows one when the catalogue could not be loaded', async () => {
    fake.setTableResult('exercises', { data: null, error: { message: 'permission denied' } });
    const { onCreateCustom } = renderPicker();
    await screen.findByRole('alert');
    await openCreateForm();

    fireEvent.change(screen.getByLabelText(NAME_LABEL), { target: { value: 'Press con banda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(onCreateCustom).toHaveBeenCalledWith('Press con banda', null);
  });

  it('forgets the half-typed exercise when the picker is dismissed', async () => {
    renderPicker();
    await offeredNames();
    await openCreateForm();
    fireEvent.change(screen.getByLabelText(NAME_LABEL), { target: { value: 'Press con banda' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    // The dialog is hidden, not unmounted, so that name would otherwise still be
    // there on reopening — one tap away from creating the same exercise twice.
    expect(screen.queryByLabelText(NAME_LABEL)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: CREATE_TOGGLE })).toBeInTheDocument();
  });
});

describe('exercises invented earlier in this session', () => {
  const BANDA: CatalogExercise = {
    id: 'local-1',
    name: 'Press con banda',
    muscleGroupId: 'mg-pecho',
    isCustom: true,
  };

  /**
   * A custom exercise only reaches the server when the workout that uses it is saved.
   * Until then the catalogue has never heard of it, so the picker has to be told by
   * the draft -- otherwise one created a minute ago is invisible for the rest of the
   * session, and the user cannot add it twice.
   */
  it('offers them even though the catalogue has never heard of them', async () => {
    renderPicker({ localExercises: [BANDA] });

    expect(await offeredNames()).toContain('Press con banda');
  });

  it('lets one be picked like any other', async () => {
    const { onSelect, onOpenChange } = renderPicker({ localExercises: [BANDA] });
    await offeredNames();

    fireEvent.click(screen.getByRole('button', { name: 'Press con banda' }));

    expect(onSelect).toHaveBeenCalledWith(BANDA);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('finds them through the search too', async () => {
    renderPicker({ localExercises: [BANDA] });
    await offeredNames();

    fireEvent.change(search(), { target: { value: 'banda' } });

    // Asserted as "is in the results" and not as the exact set: fuse's 0.34 tolerance
    // also brings "Press Banca" along for this query, which is the same behaviour that
    // makes "press bnaca" find it above. That is the search working, not a local
    // exercise leaking into the catalogue.
    await waitFor(async () => {
      expect(await offeredNames()).toContain('Press con banda');
    });
  });
});

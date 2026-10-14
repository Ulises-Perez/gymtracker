import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkoutExerciseCard } from '../components/workout/WorkoutExerciseCard.tsx';
import { useWeightUnit } from '../hooks/useProfile.ts';
import type { WorkoutExerciseDraft } from '../stores/workout-store.ts';
import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { AuthProvider } from '../providers/AuthProvider.tsx';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { ProfilePage } from './ProfilePage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';
const EXERCISE_ID = '01920000-0000-7000-8000-0000000000a1';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

/**
 * The browser half of a download, stubbed.
 *
 * jsdom has no object URLs, so the two functions the export calls are installed here and the clicked
 * anchor is captured. What this lets a test see is the *file* — its name, its media type and its
 * bytes — which is the only part of a download that can be asserted at all.
 */
let downloaded: Blob[];
let revokeObjectURL: (url: string) => void;
let clickedAnchors: HTMLAnchorElement[];

function stubDownload() {
  downloaded = [];
  clickedAnchors = [];
  revokeObjectURL = vi.fn();

  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloaded.push(blob);

    return `blob:gymtracker/${downloaded.length}`;
  });
  URL.revokeObjectURL = revokeObjectURL;

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedAnchors.push(this);
  });
}

function workoutExportRow() {
  return {
    date: '2026-10-13',
    title: 'Piernas',
    duration_minutes: 50,
    workout_sets: [
      {
        exercise_id: EXERCISE_ID,
        set_number: 1,
        reps: 5,
        weight_kg: '72.50',
        rpe: '8.0',
        is_warmup: false,
        notes: null,
        exercise: { name: 'Sentadilla' },
      },
    ],
    workout_exercise_targets: [],
  };
}

function profileRow(weightUnit: string) {
  return {
    username: 'ulise',
    full_name: 'Ulises',
    avatar_url: null,
    weight_unit: weightUnit,
  };
}

/**
 * The profile screen, with the query cache it now needs.
 *
 * `renderAuthScreen` next door renders only the auth provider and the router, which was enough while
 * this screen touched neither TanStack Query nor the store; the unit preference reads the profile
 * through the cache, so the provider travels with the harness here instead of changing a helper that
 * other screens depend on.
 */
function renderProfile() {
  function LocationProbe() {
    const location = useLocation();

    return <p>ubicación:{location.pathname}</p>;
  }

  const router = createMemoryRouter(
    [
      { path: '/profile', element: <ProfilePage /> },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: ['/profile'] },
  );

  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** Every column-and-value the builders wrote, so a weight in the write would be visible here. */
function writtenCalls(): string[] {
  return fake.from.mock.results
    .flatMap((result) => (result.value as { calls?: string[] }).calls ?? [])
    .filter((call) => call.startsWith('update'));
}

beforeEach(() => {
  fake = createFakeSupabase(fakeSession());
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('profiles', { data: [profileRow('kg')], error: null });
  fake.rpc.mockResolvedValue({
    data: [
      { set_number: 1, reps: 10, weight_kg: '70.00' },
      { set_number: 2, reps: 8, weight_kg: '75.00' },
    ],
    error: null,
  });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });

  stubDownload();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfilePage', () => {
  it('closes the session and sends the user back to the login screen', async () => {
    renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('ubicación:/login')).toBeInTheDocument();
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('says so in Spanish when the sign-out fails, instead of pretending it worked', async () => {
    fake.auth.signOut.mockResolvedValue({ error: { message: 'Network request failed' } });

    renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    expect(
      await screen.findByText('No pudimos completar la operación. Probá de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('ubicación:/login')).not.toBeInTheDocument();
  });
});

/**
 * Rule one: the selector reads the stored preference and writes the chosen one — and only a
 * preference.
 */
describe('the unit preference', () => {
  it('reflects the stored unit and writes the chosen one, and writes no weight', async () => {
    fake.setTableResult('profiles', { data: [profileRow('lb')], error: null });

    renderProfile();

    // What the profile says is what the selector shows, before anyone touches it.
    expect(await screen.findByRole('button', { name: 'lb', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'kg', pressed: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'kg' }));

    // The write changes what the profile stores, and the invalidation refetches it: that is how
    // every reading screen follows the choice.
    fake.setTableResult('profiles', { data: [profileRow('kg')], error: null });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'kg', pressed: true })).toBeInTheDocument();
    });

    /*
     * The column *and its value*, which is the definition of done of S9: switching kg/lb cannot
     * touch a single stored weight. A write that carried `weight_kg` would rewrite history the
     * moment someone changed their mind about how to read it.
     */
    expect(writtenCalls()).toContain('update weight_unit=kg');
    expect(writtenCalls().some((call) => call.includes('weight_kg'))).toBe(false);
  });
});

/**
 * The CSV export, which is the other half of the definition of done of S9. Its subject is data and
 * not a screen: the file is always kilos, and the screen proves it by being in pounds when the file
 * is written.
 */
describe('the CSV export', () => {
  it('writes the stored kilograms even when the profile is set to pounds', async () => {
    // The preference really is pounds, and the selector on this very screen shows it.
    fake.setTableResult('profiles', { data: [profileRow('lb')], error: null });
    fake.setTableResult('workouts', { data: [workoutExportRow()], error: null });

    renderProfile();

    expect(await screen.findByRole('button', { name: 'lb', pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => {
      expect(downloaded).toHaveLength(1);
    });

    const csv = await downloaded[0]?.text();

    // The weight_kg column still holds the kilogram that is stored: an exported file is data, and
    // the preference changes what a screen shows and nothing that is written.
    expect(csv).toContain(';72.5;');
    expect(csv).not.toContain('lb');
  });

  it('disables the control and announces the work while the export runs', async () => {
    renderProfile();
    await screen.findByRole('button', { name: 'Exportar CSV' });

    // The read never settles, so pending is the only state the control can be in.
    vi.mocked(getSupabase).mockReturnValue(new Promise<never>(() => {}));

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    const button = screen.getByRole('button', { name: 'Exportando…' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('names the file after the day and revokes the object URL', async () => {
    fake.setTableResult('workouts', { data: [workoutExportRow()], error: null });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => {
      expect(clickedAnchors).toHaveLength(1);
    });

    const anchor = clickedAnchors[0]!;

    expect(anchor.download).toMatch(/^gymtracker-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloaded[0]?.type).toBe('text/csv;charset=utf-8');
    expect(revokeObjectURL).toHaveBeenCalledWith(anchor.href);
  });

  it('says so in Spanish when the export fails, instead of downloading an empty file', async () => {
    fake.setTableResult('workouts', { data: null, error: { message: 'permission denied' } });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos exportar el historial. Probá de nuevo.',
    );
    // A failed read must produce no file at all: a header-only CSV looks like an empty history.
    expect(downloaded).toHaveLength(0);
  });
});

/**
 * Rule three, and it is a preservation test: its subject is a behaviour that must *not* change, so
 * there is no failing state to observe before the implementation — the RED for "do not convert" is
 * the absence of the conversion, and the proof is that the assertion holds once the preference is
 * real and stored as pounds.
 *
 * The guard lives here, next to the preference, because it is the preference that must not cross the
 * line: `WorkoutExerciseCard` and its `PersonalRecords` sibling are the screens where kilos are
 * typed, and their own files are deliberately left untouched by this change. A screen cannot speak
 * two units.
 */
describe('the entry screen', () => {
  const CARD: WorkoutExerciseDraft = {
    id: 'card-1',
    exerciseId: EXERCISE_ID,
    sets: [{ id: 'set-1', reps: 5, weightKg: 100, rpe: null, isWarmup: false, notes: null }],
    targetReps: null,
    targetWeightMin: null,
    targetWeightMax: null,
  };

  it('keeps the kilo label and the kilo reference even when pounds are preferred', async () => {
    // The preference really is pounds: a component that read it would convert, and the cache says so.
    client.setQueryData(['profile', USER_ID], {
      username: 'ulise',
      fullName: 'Ulises',
      avatarUrl: null,
      weightUnit: 'lb',
    });

    /*
     * A probe that reads the preference through the same hook the reading screens use. It is here so
     * the guard is not vacuous: it proves the pounds are live and readable in this very tree, and
     * that the card below is the component choosing not to look -- not that the cache was empty.
     */
    function UnitProbe() {
      return <p data-testid="unidad">{useWeightUnit(USER_ID)}</p>;
    }

    const { container } = render(
      <QueryClientProvider client={client}>
        <UnitProbe />
        <div data-testid="tarjeta">
          <WorkoutExerciseCard
            name="Press Banca"
            card={CARD}
            onAddSet={vi.fn()}
            onUpdateSet={vi.fn()}
            onRemoveSet={vi.fn()}
            onRemoveExercise={vi.fn()}
            onSetTarget={vi.fn()}
          />
        </div>
      </QueryClientProvider>,
    );

    const card = within(container).getByTestId('tarjeta');

    expect(within(container).getByTestId('unidad')).toHaveTextContent('lb');
    // The field says kg and the reference stays in kg: the one thing that line is for is comparing
    // with the weight about to be lifted, and pounds next to a kilo field would break exactly that.
    expect(within(card).getByLabelText('Peso en kg serie 1')).toBeInTheDocument();
    expect(within(card).getByLabelText('Peso mínimo del objetivo')).toBeInTheDocument();
    expect(await within(card).findByText(/último: 8 × 75 kg/)).toBeInTheDocument();
    expect(within(card).queryByText(/lb/)).not.toBeInTheDocument();
  });
});

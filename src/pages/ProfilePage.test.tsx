import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

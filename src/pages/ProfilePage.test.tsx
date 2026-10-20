import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkoutExerciseCard } from '../components/workout/WorkoutExerciseCard.tsx';
import { useWeightUnit } from '../hooks/useProfile.ts';
import type { WorkoutExerciseDraft } from '../stores/workout-store.ts';
import { AVATAR_MAX_BYTES, AVATAR_SIZE_ERROR, AVATAR_TYPE_ERROR } from '../lib/avatar-api.ts';
import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { toStoredKg } from '../lib/units.ts';
import { AuthProvider } from '../providers/AuthProvider.tsx';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { ProfilePage } from './ProfilePage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';
const EXERCISE_ID = '01920000-0000-7000-8000-0000000000a1';
const CARD_ID = '01920000-0000-7000-8000-0000000000c1';
const MEASUREMENT_ID = '01920000-0000-7000-8000-0000000000b1';
const AVATAR_URL = `https://project.supabase.co/storage/v1/object/public/avatars/${USER_ID}/avatar-1.png`;

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

/**
 * A workout as `0012` stores it: the sets hang off their card through `workout_exercise_id`, and the
 * card is the entity that carries the order and the target. The pre-`0012` shape this used to have is
 * gone from the server, so a fixture that still spoke it exercised only the export's fallback instead
 * of the real attribution.
 */
function workoutExportRow() {
  return {
    date: '2026-10-13',
    title: 'Piernas',
    duration_minutes: 50,
    workout_sets: [
      {
        workout_exercise_id: CARD_ID,
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
    workout_exercises: [
      {
        id: CARD_ID,
        position: 1,
        exercise_id: EXERCISE_ID,
        target_reps: null,
        target_weight_min: null,
        target_weight_max: null,
        exercise: { name: 'Sentadilla' },
      },
    ],
  };
}

/** A count response, which the double's result type does not name: PostgREST puts it beside `data`. */
function counted(count: number) {
  return { data: null, error: null, count };
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
 * The three figures the phase 6 definition of done names, each derived from its read and never from a
 * column: the two the dashboard summary already returns are reused, and the best streak — which the
 * summary does not return, because its streak ends today — is derived from the days the user trained.
 */
describe('the derived stats', () => {
  it('shows the totals the server derived', async () => {
    fake.rpc.mockResolvedValue({
      data: {
        streak: 2,
        week_days: [],
        recent_prs: [],
        last_workout: null,
        total_workouts: 9,
      },
      error: null,
    });
    // Three consecutive days, so the derived best streak is 3 and not the 2 the summary reports.
    fake.setTableResult('workouts', {
      data: [{ date: '2026-10-01' }, { date: '2026-10-02' }, { date: '2026-10-03' }],
      error: null,
    });
    fake.setTableResult('personal_records', counted(12));

    renderProfile();

    const stats = await screen.findByTestId('estadisticas');

    expect(within(stats).getByText('Entrenamientos')).toBeInTheDocument();
    expect(await within(stats).findByText('9')).toBeInTheDocument();
    expect(within(stats).getByText('Mejor racha')).toBeInTheDocument();
    expect(await within(stats).findByText('3')).toBeInTheDocument();
    expect(within(stats).getByText('Récords')).toBeInTheDocument();
    expect(await within(stats).findByText('12')).toBeInTheDocument();
  });
});

/**
 * The body weight: read in the preferred unit, stored in kilos.
 */
describe('the body weight', () => {
  it('reads the weight in the preferred unit and stores the entry in kilos', async () => {
    fake.setTableResult('profiles', { data: [profileRow('lb')], error: null });
    // The day the section reads, the row its write finds, and the read after the write invalidates.
    fake.setTableResults('body_measurements', [
      { data: [{ date: '2026-10-01', weight_kg: '72.50' }], error: null },
      { data: [{ id: MEASUREMENT_ID }], error: null },
      { data: [{ date: '2026-10-01', weight_kg: '72.50' }], error: null },
    ]);

    renderProfile();

    const input = await screen.findByLabelText('Peso corporal en lb');

    fireEvent.change(input, { target: { value: '160' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const stored = String(toStoredKg(160, 'lb'));

    await waitFor(() => {
      expect(writtenCalls()).toContain(`update weight_kg=${stored}`);
    });
    // And never the typed number: the column is kilos, so writing 160 would store 160 kg.
    expect(writtenCalls().some((call) => call.includes('weight_kg=160'))).toBe(false);
  });

  it('says that a second entry for the same day is an update', async () => {
    renderProfile();

    // The day is the key of a measurement, so logging today again replaces it instead of failing.
    expect(
      await screen.findByText('Si ya cargaste el peso de hoy, se actualiza.'),
    ).toBeInTheDocument();
  });
});

/**
 * The two profile fields, and the shape the notebook prints them in.
 *
 * The field is a rule, not a box: the page draws a line under the value and nothing around it. These
 * two were the only fields on the screen carrying a border on all four sides and a control's radius,
 * which is the shape the rest of the app stopped using.
 */
describe('the profile fields', () => {
  it('draws the name and the body weight as ruled lines and not as boxes', async () => {
    renderProfile();

    const fields = [
      await screen.findByLabelText('Nombre'),
      await screen.findByLabelText('Peso corporal en kg'),
    ];

    for (const field of fields) {
      expect(field).toHaveClass('rounded-none', 'border-0', 'border-b');
    }
  });
});

/**
 * The name: the profile screen has to show the one that is stored and be able to replace it.
 *
 * What it edits is `full_name`, the column `handle_new_user()` fills from the sign-up metadata, so what
 * is shown here is the name typed when the account was created. `username` is a `UNIQUE` column no path
 * in this app writes, so a repeat is impossible and there is no duplicate to turn into a message.
 */
describe('the name', () => {
  it('shows the stored name and saves the edited one', async () => {
    renderProfile();

    // The field is drawn before the profile arrives and holds what is stored once it does, so the
    // assertion is about the settled value and not about the first paint.
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre')).toHaveValue('Ulises');
    });

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ulises Fernández' } });
    fake.setTableResult('profiles', {
      data: [{ ...profileRow('kg'), full_name: 'Ulises Fernández' }],
      error: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre')).toHaveValue('Ulises Fernández');
    });

    // The column the alta writes, and only it: a write of `username` would trip its UNIQUE index and
    // would not be the name the user typed at registration.
    expect(writtenCalls()).toContain('update full_name=Ulises Fernández');
    expect(writtenCalls().some((call) => call.includes('username'))).toBe(false);
  });

  it('says so in Spanish when the name cannot be saved, instead of showing it as saved', async () => {
    renderProfile();

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Ulises' } });
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar el nombre. Probá de nuevo.',
    );
  });
});

/**
 * The avatar: what the profile points at is what is drawn, and when it points at nothing the screen
 * still has to look finished rather than empty.
 */
describe('the avatar', () => {
  it('draws the stored avatar', async () => {
    fake.setTableResult('profiles', {
      data: [{ ...profileRow('kg'), avatar_url: AVATAR_URL }],
      error: null,
    });

    renderProfile();

    expect(await screen.findByRole('img', { name: 'Foto de perfil' })).toHaveAttribute(
      'src',
      AVATAR_URL,
    );
  });

  it('shows initials instead of an empty frame when there is no avatar', async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('avatar-placeholder')).toHaveTextContent('U');
    });

    expect(screen.queryByRole('img', { name: 'Foto de perfil' })).not.toBeInTheDocument();
  });
});

/**
 * What may be uploaded. The bucket carries no `file_size_limit` and no `allowed_mime_types`, so these
 * two messages are the only thing standing between the picker and the bucket — and a refused file has
 * to leave storage untouched, not upload and then complain.
 */
describe('the avatar upload', () => {
  function pick(file: File) {
    fireEvent.change(screen.getByLabelText('Nueva foto de perfil'), { target: { files: [file] } });
  }

  it('refuses a file that is not a PNG, JPG or WebP, in Spanish, and uploads nothing', async () => {
    renderProfile();
    await screen.findByLabelText('Nueva foto de perfil');

    pick(new File([new Uint8Array(8)], 'nota.pdf', { type: 'application/pdf' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(AVATAR_TYPE_ERROR);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a file over the cap, in Spanish, and uploads nothing', async () => {
    renderProfile();
    await screen.findByLabelText('Nueva foto de perfil');

    pick(new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], 'enorme.png', { type: 'image/png' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(AVATAR_SIZE_ERROR);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it('uploads a valid file into the user’s own folder and stores the URL that serves it', async () => {
    renderProfile();
    await screen.findByLabelText('Nueva foto de perfil');

    pick(new File([new Uint8Array(8)], 'foto.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(fake.storage.upload).toHaveBeenCalledTimes(1);
    });

    // The first folder is the storage policy's own input: any other shape is refused by the database.
    const path = fake.storage.upload.mock.calls[0]?.[0] ?? '';

    expect(path.startsWith(`${USER_ID}/`)).toBe(true);
    expect(writtenCalls()).toContain(
      `update avatar_url=https://project.supabase.co/storage/v1/object/public/avatars/${path}`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so in Spanish when the upload fails, instead of showing a saved avatar', async () => {
    fake.storage.upload.mockResolvedValue({ data: null, error: { message: 'payload too large' } });

    renderProfile();
    await screen.findByLabelText('Nueva foto de perfil');

    pick(new File([new Uint8Array(8)], 'foto.png', { type: 'image/png' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos subir la foto. Probá de nuevo.',
    );
    expect(writtenCalls().some((call) => call.includes('avatar_url'))).toBe(false);
  });

  /**
   * The control on screen is the app's own.
   *
   * The native file field draws its own words -- "Choose File / No file chosen" -- in the browser's
   * language, with its own grey button and type: a Spanish app with an English widget in the middle of
   * the page. No class on that field replaces what the browser prints inside it, so the field stops
   * being the thing on screen. What the picker needs is a named field; what the page shows is a ruled
   * control of ours that presses it.
   */
  it('opens the picker from the app’s own control, with the native field hidden and named', () => {
    renderProfile();

    const field = screen.getByLabelText('Nueva foto de perfil');
    const chooser = screen.getByRole('button', { name: 'Elegir foto' });

    // The field is still the field: named, fed by the picker, and never shown.
    expect(field).toHaveAttribute('type', 'file');
    expect(field).toHaveClass('sr-only');
    // And not a Tab stop: the outline this app declares once would land on what nobody can see. The
    // ruled control is the stop instead, so the keyboard shows where it is.
    expect(field).toHaveAttribute('tabindex', '-1');

    // The control on screen is what opens it.
    const activated = vi.fn();
    field.addEventListener('click', activated);
    fireEvent.click(chooser);

    expect(activated).toHaveBeenCalledTimes(1);
  });

  /**
   * PRESERVE: the picker still locks itself while an upload is in flight.
   *
   * The disabled state used to sit on the native field and now covers the control that opens it as
   * well; either way the whole window between choosing a file and the upload settling is closed, so a
   * second press cannot start a second replacement.
   */
  it('locks the picker while an upload of the chosen file is running', async () => {
    renderProfile();
    const field = await screen.findByLabelText('Nueva foto de perfil');

    // The upload never settles, so pending is the only state the picker can be in.
    fake.storage.upload.mockReturnValue(new Promise<never>(() => {}));

    pick(new File([new Uint8Array(8)], 'foto.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(field).toBeDisabled();
    });
    expect(field).toHaveAttribute('aria-busy', 'true');
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
          />
        </div>
      </QueryClientProvider>,
    );

    const card = within(container).getByTestId('tarjeta');

    expect(within(container).getByTestId('unidad')).toHaveTextContent('lb');
    // The field says kg and the reference stays in kg: the one thing that line is for is comparing
    // with the weight about to be lifted, and pounds next to a kilo field would break exactly that.
    expect(within(card).getByLabelText('Peso en kg serie 1')).toBeInTheDocument();
    expect(await within(card).findByText(/último: 8 × 75 kg/)).toBeInTheDocument();
    expect(within(card).queryByText(/lb/)).not.toBeInTheDocument();
  });
});

/**
 * S10: the install entry is permanent, because the strip on Inicio is not.
 *
 * The strip answers an event that may arrive before the user has read anything; this row is where
 * someone goes on purpose, a day later. iOS has no prompt at all, so the same row has to print the
 * Safari steps. Its behaviour is covered in `src/components/pwa/InstallPrompt.test.tsx`; here the
 * subject is that Perfil carries the entry.
 */
describe('the install row', () => {
  it('installs from the App section of the profile', async () => {
    localStorage.clear();

    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    const prompt = vi.fn(async () => undefined);

    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });

    renderProfile();

    act(() => {
      window.dispatchEvent(event);
    });

    // The section is a place in the page, titled and described, and not a bare button.
    expect(await screen.findByRole('heading', { name: 'App' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Instalar en este dispositivo' }));

    // The install is the browser's dialog, not something this app claims to have done.
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});

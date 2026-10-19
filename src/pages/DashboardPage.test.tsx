import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { DashboardPage } from './DashboardPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

const USER_ID = '00000000-0000-4000-a000-000000000001';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SUMMARY = {
  streak: 3,
  // Today, by the same local formatting the strip uses, so the square lights up whatever day the
  // suite runs on. A fixed date would pass in October and fail in November.
  week_days: [new Date().toLocaleDateString('sv-SE')],
  recent_prs: [
    {
      exercise_id: '01920000-0000-7000-8000-0000000000a1',
      exercise_name: 'Press Banca',
      best_1rm: '116.67',
      max_weight_kg: '100.00',
      max_reps: 5,
      achieved_at: '2026-10-13',
    },
  ],
  last_workout: {
    id: '01920000-0000-7000-8000-000000000001',
    date: '2026-10-13',
    title: 'Empuje',
    duration_minutes: 52,
    exercise_count: 4,
  },
  total_workouts: 12,
};

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.rpc.mockResolvedValue({ data: SUMMARY, error: null });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('DashboardPage', () => {
  /*
   * S5: Inicio opens with today's date as its header, and it reads the local clock.
   *
   * The date is the `h1`, the same call the workout screen made, and the screen keeps a stable
   * accessible name on the region: a heading that changes with the clock can be looked up by no
   * test and oriented by nobody, so the region carries "Inicio" and the heading carries the day.
   */
  it("writes today's date as the header, read off the local clock", () => {
    vi.useFakeTimers();

    try {
      /*
       * 22:00 local: the UTC instant is already tomorrow, so a header read off it would be a day
       * ahead. The same trap `localIsoDate` and `formatLongDate` exist to avoid.
       */
      vi.setSystemTime(new Date(2026, 9, 14, 22, 0));

      renderPage();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Miércoles, 14 de octubre',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('paints the whole screen from the one call', async () => {
    renderPage();

    /*
     * The landmark is asserted here as well as the data, and not only because it looks right: the
     * route test identifies this screen by it, so losing it would fail that test with a reason that
     * has nothing to do with the routes. The heading is today's date, which is asserted in its own
     * test above because a test cannot look for a heading that changes with the clock.
     */
    expect(screen.getByRole('region', { name: 'Inicio' })).toBeInTheDocument();

    expect(await screen.findByText('Racha de 3 días.')).toBeInTheDocument();
    // The date, the title and the duration are one line: an exact match on just the title would be
    // asserting a shape the screen does not have.
    expect(screen.getByText(/Empuje/)).toBeInTheDocument();
    expect(screen.getByText('4 ejercicios')).toBeInTheDocument();
    expect(screen.getByText('Press Banca')).toBeInTheDocument();

    // One call, and the assertion is that the screen made no others to build itself.
    expect(fake.rpc).toHaveBeenCalledWith('dashboard_summary');
  });

  it('writes the singular when the session had a single exercise', async () => {
    fake.rpc.mockResolvedValue({
      data: {
        ...SUMMARY,
        last_workout: { ...SUMMARY.last_workout, exercise_count: 1 },
      },
      error: null,
    });

    renderPage();

    /*
     * A session with one exercise is ordinary — it is what the end-to-end suite records — and the
     * plural was hardcoded, so the screen said "1 ejercicios" to anyone looking at it. The kind of
     * copy defect a screenshot catches and a passing suite never did.
     */
    expect(await screen.findByText('1 ejercicio')).toBeInTheDocument();
  });

  it('reads the recent records in the preferred unit', async () => {
    fake.setTableResult('profiles', {
      data: [{ username: null, full_name: null, avatar_url: null, weight_unit: 'lb' }],
      error: null,
    });

    renderPage();

    // 100 kg is 220.5 lb. The streak and the week strip above are not weights, so they do not
    // convert -- only the records line does.
    expect(await screen.findByText(/220\.5 lb/)).toBeInTheDocument();
  });

  it('lights up the days of this week that were trained', async () => {
    renderPage();
    await screen.findByText('Racha de 3 días.');

    // Seven squares, and exactly the ones the database reported are marked.
    const strip = screen.getByRole('list', { name: 'Esta semana' });

    expect(strip.querySelectorAll('li')).toHaveLength(7);
    expect(screen.getAllByRole('listitem', { name: 'entrenado' })).toHaveLength(1);
  });

  it('welcomes someone who has never trained, instead of showing broken cards', async () => {
    fake.rpc.mockResolvedValue({
      data: { streak: 0, week_days: [], recent_prs: [], last_workout: null, total_workouts: 0 },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText(/Todavía no registraste ningún entrenamiento/),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin racha por ahora.')).toBeInTheDocument();
  });

  it('reports a failed read in Spanish instead of an empty dashboard', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el inicio');
  });

  it('always offers the way into a new workout', () => {
    renderPage();

    expect(screen.getByRole('link', { name: '+ Nuevo workout' })).toBeInTheDocument();
  });

  /**
   * The floating action rides the column, not the edge of the window.
   *
   * The whole app is one 32rem column with a 16px margin, and this control was pinned to the
   * viewport's right edge: on a phone that is the column's margin, so it looked right, and on a
   * desktop it hung over the paper with nothing under it. The frame that carries it now has the
   * column's own cap and margin -- and since it spans the viewport, it has to stay out of the way of
   * the presses that belong to the page behind it.
   */
  it('anchors the floating action to the column and lets touches through around it', () => {
    renderPage();

    const action = screen.getByRole('link', { name: '+ Nuevo workout' });

    // The frame floats over the viewport, so the action can be laid against the column inside it.
    const frame = action.closest('.pointer-events-none');

    expect(frame).toHaveClass('fixed');

    // Inside the frame, the action keeps the screen's own cap and 16px margin.
    expect(action.parentElement).toHaveClass('mx-auto', 'w-full', 'max-w-lg', 'px-8');
    // The frame is a placeholder and not a curtain: the press has to land on the action itself.
    expect(action).toHaveClass('pointer-events-auto');
  });

  /**
   * The other half of S8: while the user reads this, the two screens one tap away are fetched.
   */
  it('warms the catalogue and the history while the user reads the dashboard', async () => {
    fake.setTableResult('exercises', {
      data: [{ id: 'ex-1', name: 'Press Banca', muscle_group_id: null, is_custom: false }],
      error: null,
    });
    fake.setTableResult('muscle_groups', { data: [], error: null });
    fake.setTableResult('workouts', { data: [], error: null });

    renderPage();
    await screen.findByText('Racha de 3 días.');

    await vi.waitFor(() => {
      expect(client.getQueryData(['catalog', USER_ID])).toBeDefined();
      expect(client.getQueryData(['history', USER_ID])).toBeDefined();
    });
  });

  /**
   * A head start, not a requirement: if the warming fails the dashboard must be exactly as useful as
   * it was. Awaiting the prefetch would have made the first screen of the app depend on two requests it
   * does not need.
   */
  it('stays whole when the background fetch fails', async () => {
    fake.setTableResult('exercises', { data: null, error: { message: 'permission denied' } });

    renderPage();

    expect(await screen.findByText('Racha de 3 días.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/**
 * S10: "instalable Android". The install lands on the first screen of the app, and only there.
 *
 * Chromium announces it with `beforeinstallprompt`; the strip is the app's own offer, in the
 * notebook's own words, instead of the browser's mini-infobar. Its behaviour is covered in
 * `src/components/pwa/InstallPrompt.test.tsx` — what this test holds is that Inicio carries it and
 * that it does not cost the screen anything it already did.
 */
describe('the install strip', () => {
  /** Chromium's deferred event, which TypeScript's DOM lib does not declare. */
  function offerInstall() {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };

    Object.assign(event, {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });

    act(() => {
      window.dispatchEvent(event);
    });
  }

  it('offers the install on Inicio once the browser allows it, without touching the data', async () => {
    localStorage.clear();
    renderPage();

    // Nothing is offered before the browser says the app is installable.
    expect(screen.queryByRole('button', { name: 'Instalar la app' })).not.toBeInTheDocument();

    offerInstall();

    expect(screen.getByRole('button', { name: 'Instalar la app' })).toBeInTheDocument();
    // The strip is a line on the page: the dashboard behind it is still the dashboard.
    expect(await screen.findByText('Racha de 3 días.')).toBeInTheDocument();
  });
});

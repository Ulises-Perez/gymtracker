import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
  it('paints the whole screen from the one call', async () => {
    renderPage();

    /*
     * The title is asserted here as well as the data, and not only because it looks right: the route
     * test identifies this screen by it, so losing it would fail that test with a reason that has
     * nothing to do with the routes.
     */
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();

    expect(await screen.findByText('Racha de 3 días.')).toBeInTheDocument();
    // The date, the title and the duration are one line: an exact match on just the title would be
    // asserting a shape the screen does not have.
    expect(screen.getByText(/Empuje/)).toBeInTheDocument();
    expect(screen.getByText('4 ejercicios')).toBeInTheDocument();
    expect(screen.getByText('Press Banca')).toBeInTheDocument();

    // One call, and the assertion is that the screen made no others to build itself.
    expect(fake.rpc).toHaveBeenCalledWith('dashboard_summary');
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

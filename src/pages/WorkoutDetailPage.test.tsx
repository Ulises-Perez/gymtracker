import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { WorkoutDetailPage } from './WorkoutDetailPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

const WORKOUT_ID = '33333333-3333-4333-8333-333333333333';
const PRESS_BANCA = '01920000-0000-7000-8000-0000000000a1';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

/**
 * Rendered through a real route rather than a mocked `useParams`: the page reads its id from the
 * address, and a test that hands it one directly would not notice the day the route stops passing it.
 */
function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/history/${WORKOUT_ID}`]}>
        <Routes>
          <Route path="/history/:workoutId" element={<WorkoutDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('workouts', {
    data: [{ id: WORKOUT_ID, date: '2026-10-13', title: 'Empuje', duration_minutes: 52 }],
    error: null,
  });
  fake.setTableResult('workout_sets', {
    data: [
      {
        id: 'set-1',
        exercise_id: PRESS_BANCA,
        set_number: 1,
        reps: 10,
        weight_kg: '70.00',
        is_warmup: false,
      },
      {
        id: 'set-2',
        exercise_id: PRESS_BANCA,
        set_number: 2,
        reps: 8,
        weight_kg: '75.00',
        is_warmup: false,
      },
    ],
    error: null,
  });
  fake.setTableResult('exercises', {
    data: [{ id: PRESS_BANCA, name: 'Press Banca', muscle_group_id: 'mg-pecho', is_custom: false }],
    error: null,
  });
  fake.setTableResult('muscle_groups', {
    data: [{ id: 'mg-pecho', name: 'Pecho', icon: null }],
    error: null,
  });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('WorkoutDetailPage', () => {
  it('shows the workout and its sets, under the name the catalogue has for them', async () => {
    renderPage();

    expect(await screen.findByText('13/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Empuje')).toBeInTheDocument();
    expect(screen.getByText('52 min')).toBeInTheDocument();

    // The name comes from the catalogue, which is also the list the picker used to add it.
    expect(await screen.findByRole('heading', { name: 'Press Banca' })).toBeInTheDocument();
    expect(screen.getByText(/1ª · 10 × 70 kg/)).toBeInTheDocument();
    expect(screen.getByText(/2ª · 8 × 75 kg/)).toBeInTheDocument();
  });

  it('says the workout may be gone when it cannot be read', async () => {
    fake.setTableResult('workouts', { data: [], error: null });

    renderPage();

    // Deleted, or never this user's: RLS makes the two indistinguishable, so the screen says what it
    // actually knows instead of picking one.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar este entrenamiento',
    );
  });

  it('keeps a way back to the list while it loads', () => {
    renderPage();

    expect(screen.getByRole('link', { name: '← Historial' })).toBeInTheDocument();
  });
});

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { HistoryPage } from './HistoryPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

/*
 * The route sits behind `RequireAuth`, so the session is the gate's business and not this screen's.
 */
vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function row(index: number) {
  return {
    id: `01920000-0000-7000-8000-0000000000${String(index).padStart(2, '0')}`,
    date: '2026-10-13',
    title: `Entrenamiento ${index}`,
    duration_minutes: 50,
  };
}

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      {/* A router, because every row is a link to its own detail now. */}
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('HistoryPage', () => {
  it('lists the workouts the server returned', async () => {
    fake.setTableResult('workouts', { data: [row(1), row(2)], error: null });

    renderPage();

    expect(await screen.findByText('Entrenamiento 1 · 50 min')).toBeInTheDocument();
    expect(screen.getByText('Entrenamiento 2 · 50 min')).toBeInTheDocument();
    // The date is formatted from the string the database returns, never through a `Date`.
    expect(screen.getAllByText('13/10/2026')).toHaveLength(2);
  });

  it('says so when there is nothing yet, instead of looking broken', async () => {
    fake.setTableResult('workouts', { data: [], error: null });

    renderPage();

    expect(
      await screen.findByText('Todavía no registraste ningún entrenamiento.'),
    ).toBeInTheDocument();
  });

  it('reports a failed load in Spanish instead of showing an empty list', async () => {
    fake.setTableResult('workouts', { data: null, error: { message: 'permission denied' } });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el historial');
  });

  /**
   * The heading is there in every state, and this is the assertion that keeps it that way. A screen
   * that drops its title while it loads looks like a different screen — and the route test, which
   * identifies this page by that heading, would fail while reporting the wrong reason.
   */
  it('keeps its heading while it is still loading', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
  });
});

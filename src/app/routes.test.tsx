import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import { AuthProvider } from '../providers/AuthProvider.tsx';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { routes } from './routes.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

/**
 * The shell is behind `RequireAuth`, so these tests sign a fake session in.
 * What happens without one is the gate's own business and is covered in
 * `RequireAuth.test.tsx`; here the subject stays the route table itself.
 */
beforeEach(() => {
  const fake = createFakeSupabase(fakeSession());

  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

describe('app routes', () => {
  it('renders the shell and the dashboard on the root route', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('resolves each lazily loaded route by its own address', async () => {
    renderAt('/history');

    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeInTheDocument();
  });

  it('resolves the workout route', async () => {
    renderAt('/workout');

    expect(await screen.findByRole('heading', { name: 'Entrenar' })).toBeInTheDocument();
  });

  it('falls back to the not-found screen for an unknown route', async () => {
    renderAt('/ruta-que-no-existe');

    expect(await screen.findByRole('heading', { name: /no encontrada/i })).toBeInTheDocument();
  });
});

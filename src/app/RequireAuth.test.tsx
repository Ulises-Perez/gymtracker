import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import { AuthProvider } from '../providers/AuthProvider.tsx';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { RequireAuth } from './RequireAuth.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

/**
 * A miniature route table. What is under test is the gate, so the protected
 * screen and the login screen are stand-ins; the login stand-in prints where
 * the visitor was headed, which is the part of the redirect worth pinning.
 */
function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <>
      <h1>Ingresar</h1>
      <p>desde:{from ?? 'ninguno'}</p>
    </>
  );
}

const routes = [
  {
    element: <RequireAuth />,
    children: [{ path: '/history', element: <h1>Historial privado</h1> }],
  },
  { path: '/login', element: <LoginStub /> },
];

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

describe('RequireAuth', () => {
  it('shows a skeleton while the session is unknown, instead of redirecting', () => {
    fake.auth.getSession.mockReturnValue(new Promise<never>(() => {}));

    renderAt('/history');

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Historial privado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ingresar' })).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to login, remembering where they were going', async () => {
    renderAt('/history');

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.getByText('desde:/history')).toBeInTheDocument();
  });

  it('renders the protected screen when there is a session', async () => {
    fake = createFakeSupabase(fakeSession());
    vi.mocked(getSupabase).mockResolvedValue(fake.client);

    renderAt('/history');

    expect(await screen.findByRole('heading', { name: 'Historial privado' })).toBeInTheDocument();
  });
});

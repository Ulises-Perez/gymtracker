import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { renderAuthScreen } from '../testing/render-auth-screen.tsx';
import { ProfilePage } from './ProfilePage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeSupabase(fakeSession());
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

describe('ProfilePage', () => {
  it('closes the session and sends the user back to the login screen', async () => {
    renderAuthScreen(<ProfilePage />, '/profile');

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('ubicación:/login')).toBeInTheDocument();
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('says so in Spanish when the sign-out fails, instead of pretending it worked', async () => {
    fake.auth.signOut.mockResolvedValue({ error: { message: 'Network request failed' } });

    renderAuthScreen(<ProfilePage />, '/profile');

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    expect(
      await screen.findByText('No pudimos completar la operación. Probá de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('ubicación:/login')).not.toBeInTheDocument();
  });
});

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { renderAuthScreen } from '../testing/render-auth-screen.tsx';
import { ResetPasswordPage } from './ResetPasswordPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

function signedIn() {
  fake = createFakeSupabase(fakeSession());
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

function fill(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Repetí la contraseña nueva'), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}

/** The page shows the skeleton until the session resolves, so wait for the form. */
async function fillWhenReady(password: string, confirmation: string) {
  await screen.findByLabelText('Contraseña nueva');
  fill(password, confirmation);
}

describe('ResetPasswordPage', () => {
  it('sends a visitor with no session to ask for a fresh link', async () => {
    renderAuthScreen(<ResetPasswordPage />, '/reset-password');

    expect(await screen.findByText('ubicación:/forgot-password')).toBeInTheDocument();
  });

  it('refuses to save when the passwords differ', async () => {
    signedIn();

    renderAuthScreen(<ResetPasswordPage />, '/reset-password');

    await fillWhenReady('nueva12345', 'otra123456');

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(fake.auth.updateUser).not.toHaveBeenCalled();
  });

  it('saves the new password and takes the visitor into the app', async () => {
    signedIn();

    renderAuthScreen(<ResetPasswordPage />, '/reset-password');

    await fillWhenReady('nueva12345', 'nueva12345');

    expect(await screen.findByText('ubicación:/')).toBeInTheDocument();
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'nueva12345' });
  });
});

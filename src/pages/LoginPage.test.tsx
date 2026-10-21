import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { renderAuthScreen } from '../testing/render-auth-screen.tsx';
import { LoginPage } from './LoginPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginPage', () => {
  it('validates in Spanish before bothering the server', async () => {
    renderAuthScreen(<LoginPage />, '/login');

    fill('no-es-un-email', 'secreta123');

    expect(await screen.findByText('Ingresá un email válido')).toBeInTheDocument();
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with what the visitor typed and returns them where they were going', async () => {
    renderAuthScreen(<LoginPage />, { pathname: '/login', state: { from: '/history' } });

    fill('atleta@example.test', 'secreta123');

    expect(await screen.findByText('ubicación:/history')).toBeInTheDocument();
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'atleta@example.test',
      password: 'secreta123',
    });
  });

  it('shows a Spanish message when the credentials are rejected', async () => {
    fake.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    renderAuthScreen(<LoginPage />, '/login');

    fill('atleta@example.test', 'equivocada');

    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
    expect(screen.queryByText(/ubicación:/)).not.toBeInTheDocument();
  });
});

/**
 * S3: both ways out of this screen have to look like links.
 *
 * They were underlined with the separator rule (`rule`, #d8d6cf): 1.30:1 over the paper, where WCAG
 * 1.4.11 asks 3:1. The shared pointer is `link-ruled`, declared once in `src/index.css`.
 */
describe('the links on this screen', () => {
  it('underlines both of them with the shared link class, not the separator rule', () => {
    renderAuthScreen(<LoginPage />, '/login');

    const register = screen.getByRole('link', { name: 'Creá una' });
    const forgot = screen.getByRole('link', { name: 'Olvidé mi contraseña' });

    for (const link of [register, forgot]) {
      expect(link).toHaveClass('link-ruled');
      expect(link).not.toHaveClass('decoration-rule');
    }
  });
});

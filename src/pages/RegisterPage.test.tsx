import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase, fakeSession } from '../testing/fake-supabase.ts';
import { renderAuthScreen } from '../testing/render-auth-screen.tsx';
import { RegisterPage } from './RegisterPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

function fill(values: { name?: string; email?: string; password: string; confirmation: string }) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: values.name ?? 'Ana' } });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: values.email ?? 'atleta@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: values.password } });
  fireEvent.change(screen.getByLabelText('Repetí la contraseña'), {
    target: { value: values.confirmation },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('RegisterPage', () => {
  it('refuses to create anything when the passwords differ', async () => {
    renderAuthScreen(<RegisterPage />, '/register');

    fill({ password: 'secreta123', confirmation: 'otra12345' });

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(fake.auth.signUp).not.toHaveBeenCalled();
  });

  it('creates the account with the name the database trigger needs', async () => {
    renderAuthScreen(<RegisterPage />, '/register');

    fill({ password: 'secreta123', confirmation: 'secreta123' });

    expect(await screen.findByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
    expect(fake.auth.signUp).toHaveBeenCalledWith({
      email: 'atleta@example.test',
      password: 'secreta123',
      options: { data: { full_name: 'Ana' } },
    });
  });

  it('walks straight into the app when the project signs in without confirming', async () => {
    fake.auth.signUp.mockResolvedValue({
      data: { user: null, session: fakeSession() },
      error: null,
    });

    renderAuthScreen(<RegisterPage />, '/register');

    fill({ password: 'secreta123', confirmation: 'secreta123' });

    expect(await screen.findByText('ubicación:/')).toBeInTheDocument();
  });
});

/**
 * S3: both ways back to the login have to look like links -- the one on the form and the one on the
 * "revisá tu correo" screen, which is the only way out of it.
 *
 * Both were underlined with the separator rule (`rule`, #d8d6cf): 1.30:1 over the paper, where WCAG
 * 1.4.11 asks 3:1. The shared pointer is `link-ruled`, declared once in `src/index.css`.
 */
describe('the links on this screen', () => {
  it('underlines the one on the form with the shared link class', () => {
    renderAuthScreen(<RegisterPage />, '/register');

    const login = screen.getByRole('link', { name: 'Entrá' });

    expect(login).toHaveClass('link-ruled');
    expect(login).not.toHaveClass('decoration-rule');
  });

  it('underlines the one on the confirmation with the shared link class', async () => {
    renderAuthScreen(<RegisterPage />, '/register');

    fill({ password: 'secreta123', confirmation: 'secreta123' });

    await screen.findByRole('heading', { name: 'Revisá tu correo' });

    const login = screen.getByRole('link', { name: 'Volver a entrar' });

    expect(login).toHaveClass('link-ruled');
    expect(login).not.toHaveClass('decoration-rule');
  });
});

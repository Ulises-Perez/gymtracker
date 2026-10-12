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

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSupabase } from '../lib/supabase.ts';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { renderAuthScreen } from '../testing/render-auth-screen.tsx';
import { ForgotPasswordPage } from './ForgotPasswordPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

function ask(email = 'atleta@example.test') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Mandarme el link' }));
}

describe('ForgotPasswordPage', () => {
  it('asks for the email and confirms without telling whether the account exists', async () => {
    renderAuthScreen(<ForgotPasswordPage />, '/forgot-password');

    ask();

    expect(await screen.findByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('atleta@example.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it('shows a Spanish message when the mail service is throttling', async () => {
    // Supabase sends the code with the message; the message alone is only kept
    // in the map for servers old enough not to have one.
    fake.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
    });

    renderAuthScreen(<ForgotPasswordPage />, '/forgot-password');

    ask();

    expect(
      await screen.findByText('Mandamos demasiados emails seguidos. Probá en unos minutos.'),
    ).toBeInTheDocument();
  });
});

/**
 * S3: the way back to the login has to look like a link, on the form and on the confirmation that
 * replaces it.
 *
 * Both were underlined with the separator rule (`rule`, #d8d6cf): 1.30:1 over the paper, where WCAG
 * 1.4.11 asks 3:1. The shared pointer is `link-ruled`, declared once in `src/index.css`.
 */
describe('the link back to the login', () => {
  it('underlines the one on the form with the shared link class', () => {
    renderAuthScreen(<ForgotPasswordPage />, '/forgot-password');

    const login = screen.getByRole('link', { name: 'Volver a entrar' });

    expect(login).toHaveClass('link-ruled');
    expect(login).not.toHaveClass('decoration-rule');
  });

  it('underlines the one on the confirmation with the shared link class', async () => {
    renderAuthScreen(<ForgotPasswordPage />, '/forgot-password');

    ask();

    await screen.findByRole('heading', { name: 'Revisá tu correo' });

    const login = screen.getByRole('link', { name: 'Volver a entrar' });

    expect(login).toHaveClass('link-ruled');
    expect(login).not.toHaveClass('decoration-rule');
  });
});

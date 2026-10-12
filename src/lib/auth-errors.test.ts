import { describe, expect, it } from 'vitest';

import { authErrorMessage } from './auth-errors.ts';

/**
 * Supabase answers in English, with a `code` that is stable and a `message`
 * that is not. The screens only ever show what this function returns, so the
 * fallback matters as much as the mapping: a user must never read an English
 * error, and never an empty one either.
 */
describe('authErrorMessage', () => {
  it('maps the code of a wrong password', () => {
    expect(
      authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe('Email o contraseña incorrectos.');
  });

  it('maps an unconfirmed email', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
      'Todavía no confirmaste tu email. Revisá tu correo.',
    );
  });

  it('maps rate limiting, which is what a user hitting send twice sees', () => {
    expect(
      authErrorMessage({
        code: 'over_email_send_rate_limit',
        message: 'Email rate limit exceeded',
      }),
    ).toBe('Mandamos demasiados emails seguidos. Probá en unos minutos.');
  });

  it('falls back to the English message when an older client sends no code', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe(
      'Email o contraseña incorrectos.',
    );
  });

  it('uses a generic Spanish message for anything it does not know', () => {
    expect(authErrorMessage({ code: 'brand_new_failure', message: 'Something exploded' })).toBe(
      'No pudimos completar la operación. Probá de nuevo.',
    );
  });

  it('survives a thrown value that is not an error at all', () => {
    expect(authErrorMessage(null)).toBe('No pudimos completar la operación. Probá de nuevo.');
    expect(authErrorMessage('boom')).toBe('No pudimos completar la operación. Probá de nuevo.');
  });
});

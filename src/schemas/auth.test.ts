import { describe, expect, it } from 'vitest';

import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.ts';

/**
 * The schemas are the contract the screens show to the user, so what is pinned
 * here is the exact message and the field it complains about — not just that
 * validation fails.
 */
function firstError(result: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) {
  const issue = result.error?.issues[0];

  return { message: issue?.message, path: issue?.path[0] };
}

describe('loginSchema', () => {
  it('accepts an email and a password', () => {
    expect(
      loginSchema.safeParse({ email: 'atleta@example.test', password: 'secreta123' }).success,
    ).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = loginSchema.safeParse({ email: 'no-es-un-email', password: 'secreta123' });

    expect(firstError(result)).toEqual({ message: 'Ingresá un email válido', path: 'email' });
  });

  it('only asks for a password, it does not re-validate its length', () => {
    // A password that predates any new rule still has to be able to log in: the
    // server is the one that decides, and blocking it here would lock people out.
    const result = loginSchema.safeParse({ email: 'atleta@example.test', password: 'corta' });

    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'atleta@example.test', password: '' });

    expect(firstError(result)).toEqual({ message: 'Ingresá tu contraseña', path: 'password' });
  });
});

describe('registerSchema', () => {
  const valid = {
    fullName: 'Ana',
    email: 'atleta@example.test',
    password: 'secreta123',
    confirmPassword: 'secreta123',
  };

  it('accepts a complete form', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a password shorter than eight characters', () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: 'corta',
      confirmPassword: 'corta',
    });

    expect(firstError(result)).toEqual({
      message: 'La contraseña necesita al menos 8 caracteres',
      path: 'password',
    });
  });

  it('rejects a name that is too short', () => {
    const result = registerSchema.safeParse({ ...valid, fullName: 'A' });

    expect(firstError(result)).toEqual({ message: 'Poné tu nombre', path: 'fullName' });
  });

  it('complains on the confirmation field when the passwords differ', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'otra12345' });

    expect(firstError(result)).toEqual({
      message: 'Las contraseñas no coinciden',
      path: 'confirmPassword',
    });
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts an email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'atleta@example.test' }).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(firstError(forgotPasswordSchema.safeParse({ email: 'x' })).message).toBe(
      'Ingresá un email válido',
    );
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a long enough password confirmed twice', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'nueva12345', confirmPassword: 'nueva12345' })
        .success,
    ).toBe(true);
  });

  it('rejects a short password', () => {
    const result = resetPasswordSchema.safeParse({ password: 'corta', confirmPassword: 'corta' });

    expect(firstError(result)).toEqual({
      message: 'La contraseña necesita al menos 8 caracteres',
      path: 'password',
    });
  });

  it('complains on the confirmation field when the passwords differ', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'nueva12345',
      confirmPassword: 'otra123456',
    });

    expect(firstError(result)).toEqual({
      message: 'Las contraseñas no coinciden',
      path: 'confirmPassword',
    });
  });
});

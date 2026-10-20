import { z } from './zod.ts';

/**
 * Form schemas, shared by the screens and their tests.
 *
 * Messages are Spanish because a user reads them, and the field a rule points
 * at matters as much as the rule: the screens put each message under the input
 * that caused it.
 *
 * Login deliberately does **not** validate the password length. Someone whose
 * password predates the current rule still has to get in, and the server is the
 * authority on what it accepts; blocking that here would lock people out.
 */
const email = z.email('Ingresá un email válido');
const newPassword = z.string().min(8, 'La contraseña necesita al menos 8 caracteres');

const passwordsMatch = (values: { password: string; confirmPassword: string }) =>
  values.password === values.confirmPassword;

const passwordsMismatch = () => ({
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Poné tu nombre'),
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, passwordsMismatch());

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, passwordsMismatch());

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

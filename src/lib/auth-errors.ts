/**
 * Turns a Supabase auth error into a Spanish sentence a user can act on.
 *
 * Supabase answers in English, with a stable `code` and a message that is not
 * stable, so the code is what gets mapped; a handful of known messages cover
 * older clients that send no code at all. Anything unrecognised becomes one
 * generic sentence: an English error is worse than no detail, and an empty one
 * is worse than both.
 */
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email o contraseña incorrectos.',
  email_not_confirmed: 'Todavía no confirmaste tu email. Revisá tu correo.',
  user_already_exists: 'Ya existe una cuenta con ese email.',
  email_exists: 'Ya existe una cuenta con ese email.',
  weak_password: 'Esa contraseña es muy débil. Probá con una más larga.',
  over_email_send_rate_limit: 'Mandamos demasiados emails seguidos. Probá en unos minutos.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Esperá un momento.',
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  session_not_found: 'Tu sesión expiró. Pedí el link de recuperación otra vez.',
  session_expired: 'Tu sesión expiró. Pedí el link de recuperación otra vez.',
  signup_disabled: 'El registro está deshabilitado.',
  email_address_invalid: 'Ese email no es válido.',
};

const BY_MESSAGE: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'Email not confirmed': 'Todavía no confirmaste tu email. Revisá tu correo.',
  'User already registered': 'Ya existe una cuenta con ese email.',
};

const FALLBACK = 'No pudimos completar la operación. Probá de nuevo.';

function readString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === 'string' ? candidate : null;
}

export function authErrorMessage(error: unknown): string {
  const code = readString(error, 'code');
  const byCode = code ? BY_CODE[code] : undefined;

  if (byCode) {
    return byCode;
  }

  const message = readString(error, 'message');
  const byMessage = message ? BY_MESSAGE[message] : undefined;

  if (byMessage) {
    return byMessage;
  }

  if (!import.meta.env.DEV) {
    // In production nobody can look over the user's shoulder: leave a trace for
    // whoever has to explain this failure later.
    console.warn('[auth] unmapped error', error);
  }

  return FALLBACK;
}

import { useContext } from 'react';

import { AuthContext } from '../providers/auth-context.ts';
import type { AuthContextValue } from '../providers/auth-context.ts';

/**
 * Reads the session and the auth actions anywhere below `AuthProvider`.
 *
 * It throws instead of returning a dummy value: calling this outside the
 * provider is a wiring bug, and a silent null session would look exactly like a
 * signed-out user.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }

  return value;
}

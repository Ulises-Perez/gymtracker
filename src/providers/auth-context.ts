import type { Session, User } from '@supabase/supabase-js';
import { createContext } from 'react';

/**
 * The auth context itself lives apart from its provider on purpose: a module
 * that exports a component and a plain value breaks React Fast Refresh, and
 * lint says so.
 */
export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read, and never guessed before that. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ session: Session | null }>;
  signOut: () => Promise<void>;
  /** Sends the recovery email; the link comes back to `/reset-password`. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the signed-in session (recovery or change). */
  updatePassword: (password: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

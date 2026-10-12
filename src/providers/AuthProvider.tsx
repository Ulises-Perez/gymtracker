import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { getSupabase } from '../lib/supabase.ts';
import { AuthContext } from './auth-context.ts';
import type { AuthContextValue } from './auth-context.ts';

/**
 * Owns the session for the whole app.
 *
 * Two sources feed the state and neither is redundant: `onAuthStateChange` is
 * what keeps login, logout, token refresh and other tabs in sync without a
 * reload, while `getSession()` answers from storage without waiting for an
 * event. Only the first of the two that answers clears `loading` — a slow read
 * must never overwrite a session that an event already reported.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let answered = false;
    let unsubscribe: (() => void) | undefined;

    void getSupabase().then((supabase) => {
      if (cancelled) {
        return;
      }

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        answered = true;
        setSession(nextSession);
        setLoading(false);
      });

      unsubscribe = () => {
        data.subscription.unsubscribe();
      };

      void supabase.auth.getSession().then(({ data: stored }) => {
        if (cancelled || answered) {
          return;
        }

        setSession(stored.session);
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn: async (email, password) => {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        // The Supabase error travels as-is: it carries `code` and `status`,
        // which is what the screens need to pick a message.
        if (error) {
          throw error;
        }
      },
      signUp: async (email, password, fullName) => {
        const supabase = await getSupabase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // The `handle_new_user` trigger fills `profiles.full_name` from this
          // metadata, and at sign-up there is no profile to update yet.
          options: { data: { full_name: fullName } },
        });

        if (error) {
          throw error;
        }

        // A null session means the project asks for email confirmation first.
        return { session: data.session };
      },
      signOut: async () => {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.signOut();

        if (error) {
          throw error;
        }
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

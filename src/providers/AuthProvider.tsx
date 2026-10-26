import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { afterPaint } from '../lib/after-paint.ts';
import { clearLocalUserData } from '../lib/session-cleanup.ts';
import { getSupabase } from '../lib/supabase.ts';
import { sessionState } from '../lib/stored-session.ts';
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
  // The browser can answer "signed out" on its own: the session lives in
  // `localStorage` and the address may carry the tokens of a link. When it
  // holds neither, the SDK has nothing to find, so the gate can decide at
  // once instead of after the network client loads.
  const [loading, setLoading] = useState(() => sessionState() !== 'signed-out');

  useEffect(() => {
    let cancelled = false;
    let answered = false;
    let unsubscribe: (() => void) | undefined;

    const connect = () => {
      void getSupabase().then((supabase) => {
        if (cancelled) {
          return;
        }

        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
          answered = true;
          setSession(nextSession);
          setLoading(false);

          /*
           * The SDK removes the session even when the sign-out request cannot reach
           * the server, so SIGNED_OUT is the one event that means "the account on
           * this device is gone". Everything the app remembered about it goes with
           * it: the persisted query cache, the in-progress draft and the queue.
           * Without this, the next account signs in over A's data and a paused save
           * is resumed with B's JWT.
           */
          if (event === 'SIGNED_OUT') {
            void clearLocalUserData();
          }
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
    };

    if (sessionState() === 'signed-out') {
      /*
       * The browser holds no session: the SDK has nothing to find, so it waits
       * until the first paint is on the glass. The login screen does not need
       * a network client, and its 54 KiB on the wire while the page is still
       * trying to paint is bandwidth the first paint pays for.
       *
       * It is not "never": the SDK still subscribes right after, so a sign-in
       * in another tab, a token refresh and everything else the events carry
       * keep working exactly as before.
       */
      const cancel = afterPaint(connect);

      return () => {
        cancelled = true;
        cancel();
        unsubscribe?.();
      };
    }

    connect();

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
      sendPasswordReset: async (email) => {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // The link has to land on the screen that can set the new password.
          // That URL must also be in the project's redirect allow-list, which
          // is a dashboard setting, not something this code can grant itself.
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          throw error;
        }
      },
      updatePassword: async (password) => {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          throw error;
        }
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

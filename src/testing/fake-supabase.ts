import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { vi } from 'vitest';

import type { Database } from '../types/database.ts';

/**
 * Test double for the Supabase client.
 *
 * Tests stub `getSupabase()` — the seam this project owns — instead of mocking
 * the SDK, so what runs under test is our lazy-client contract and the auth
 * context that consumes it, not supabase-js internals. Nothing in the app
 * imports this module, so it never reaches a bundle.
 */
type AuthEventCallback = (event: string, session: Session | null) => void;

type AuthResponse<T> = { data: T; error: { message: string; code?: string } | null };

export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'atleta@example.test',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as User;
}

export function fakeSession(user: User = fakeUser()): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  } as Session;
}

export function createFakeSupabase(initialSession: Session | null = null) {
  let current = initialSession;
  let notify: AuthEventCallback | null = null;

  const unsubscribe = vi.fn();

  const auth = {
    getSession: vi.fn(async (): Promise<AuthResponse<{ session: Session | null }>> => ({
      data: { session: current },
      error: null,
    })),
    onAuthStateChange: vi.fn((callback: AuthEventCallback) => {
      notify = callback;

      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithPassword: vi.fn(
      async (): Promise<AuthResponse<{ user: User | null; session: Session | null }>> => ({
        data: { user: current?.user ?? null, session: current },
        error: null,
      }),
    ),
    signUp: vi.fn(
      async (): Promise<AuthResponse<{ user: User | null; session: Session | null }>> => ({
        data: { user: null, session: null },
        error: null,
      }),
    ),
    signOut: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
    resetPasswordForEmail: vi.fn(async (): Promise<AuthResponse<Record<string, never>>> => ({
      data: {},
      error: null,
    })),
    updateUser: vi.fn(async (): Promise<AuthResponse<{ user: User | null }>> => ({
      data: { user: current?.user ?? null },
      error: null,
    })),
  };

  return {
    client: { auth } as unknown as SupabaseClient<Database>,
    auth,
    unsubscribe,
    /** Simulates an auth event, the way a login, logout or token refresh would. */
    emit(event: string, session: Session | null): void {
      current = session;
      notify?.(event, session);
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

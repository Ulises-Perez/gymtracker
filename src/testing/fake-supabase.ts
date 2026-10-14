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

  /**
   * Unstubbed RPC calls resolve with no data. A test that cares about one stubs
   * it, the same way it stubs `auth` above.
   */
  const rpc = vi.fn(
    async (): Promise<{ data: unknown; error: { message: string; code?: string } | null }> => ({
      data: null,
      error: null,
    }),
  );

  const tableResults: Record<string, { data: unknown; error: unknown }> = {};

  const from = vi.fn((table: string) =>
    createQueryBuilder(tableResults[table] ?? { data: [], error: null }),
  );

  return {
    client: { auth, rpc, from } as unknown as SupabaseClient<Database>,
    auth,
    rpc,
    from,
    /** What `from(table)` will resolve with on the next query. */
    setTableResult(table: string, result: { data: unknown; error: unknown }): void {
      tableResults[table] = result;
    },
    unsubscribe,
    /** Simulates an auth event, the way a login, logout or token refresh would. */
    emit(event: string, session: Session | null): void {
      current = session;
      notify?.(event, session);
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** Records the builder calls a single PostgREST query made, and resolves once. */
export type QueryBuilderStub = {
  calls: string[];
  select: (columns: string) => QueryBuilderStub;
  is: (column: string, value: unknown) => QueryBuilderStub;
  or: (filter: string) => QueryBuilderStub;
  eq: (column: string, value: unknown) => QueryBuilderStub;
  update: (values: Record<string, unknown>) => QueryBuilderStub;
  order: (column: string) => QueryBuilderStub;
  limit: (count: number) => QueryBuilderStub;
  /** Thenable, so both `await …select().order()` and a longer chain resolve. */
  then: (
    onfulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

/**
 * Stand-in for PostgREST's chainable query builder.
 *
 * It records every step so a test can assert the *shape* of the query —the
 * soft-delete filter, the owner scoping— rather than only its result, which is
 * where the mistakes actually live. Every step returns the same builder and only
 * `order` settles, because that is how this project writes its queries: the last
 * call is the one that is awaited.
 */
export function createQueryBuilder(result: { data: unknown; error: unknown }): QueryBuilderStub {
  const builder: QueryBuilderStub = {
    calls: [],
    select(columns) {
      builder.calls.push(`select ${columns}`);

      return builder;
    },
    is(column, value) {
      builder.calls.push(`is ${column} ${String(value)}`);

      return builder;
    },
    or(filter) {
      builder.calls.push(`or ${filter}`);

      return builder;
    },
    eq(column, value) {
      builder.calls.push(`eq ${column} ${String(value)}`);

      return builder;
    },
    update(values) {
      /*
       * The columns *and* their values, because the value is where the mistakes live: `update
       * deleted_at` is true both for a timestamp and for `null`, and the second is a soft delete that
       * never happened. Sorted by column so the recorded call is deterministic when a write carries
       * more than one.
       */
      const written = Object.keys(values)
        .sort()
        .map((column) => `${column}=${String(values[column])}`)
        .join(',');

      builder.calls.push(`update ${written}`);

      return builder;
    },
    order(column) {
      builder.calls.push(`order ${column}`);

      return builder;
    },
    limit(count) {
      builder.calls.push(`limit ${count}`);

      return builder;
    },
    /*
     * Thenable, and that is what lets both shapes of query be written honestly: the ones that end at
     * `order` and are awaited there, and a keyset page, which needs two `order`s and a `limit`. The
     * previous stub settled on `order`, so the pagination query would have had to be shaped around
     * the test double instead of the other way round.
     */
    then(onfulfilled, onrejected) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

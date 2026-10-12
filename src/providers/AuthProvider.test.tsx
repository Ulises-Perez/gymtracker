import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../hooks/useAuth.ts';
import { getSupabase } from '../lib/supabase.ts';
import type { FakeSupabase } from '../testing/fake-supabase.ts';
import { createFakeSupabase, fakeSession, fakeUser } from '../testing/fake-supabase.ts';
import { AuthProvider } from './AuthProvider.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: FakeSupabase;

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper });
}

/** Renders the hook and waits for the provider to finish reading the session. */
async function renderResolvedAuth() {
  const view = renderAuth();

  await waitFor(() => {
    expect(view.result.current.loading).toBe(false);
  });

  return view;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

describe('useAuth', () => {
  it('fails loudly when used outside the provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});

describe('AuthProvider', () => {
  it('stays loading until the session is known', () => {
    // A read that never settles: the only honest way to observe the state the
    // gate has to handle on every reload.
    fake.auth.getSession.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderAuth();

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('resolves the stored session and reports it', async () => {
    const session = fakeSession();
    fake = createFakeSupabase(session);
    vi.mocked(getSupabase).mockResolvedValue(fake.client);

    const { result } = await renderResolvedAuth();

    expect(result.current.session).toEqual(session);
    expect(result.current.user).toEqual(session.user);
  });

  it('follows auth events, so login and logout need no reload', async () => {
    const { result } = await renderResolvedAuth();
    const session = fakeSession();

    act(() => {
      fake.emit('SIGNED_IN', session);
    });

    expect(result.current.user).toEqual(session.user);

    act(() => {
      fake.emit('SIGNED_OUT', null);
    });

    expect(result.current.user).toBeNull();
  });

  it('lets an auth event beat a session read that is still in flight', async () => {
    fake.auth.getSession.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderAuth();

    // Let the provider get as far as subscribing, then report an event while
    // the stored-session read is still pending.
    await act(async () => {});

    const session = fakeSession();

    act(() => {
      fake.emit('SIGNED_IN', session);
    });

    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(session.user);
  });

  it('unsubscribes from auth events when it unmounts', async () => {
    const { unmount } = await renderResolvedAuth();

    unmount();

    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('delegates signIn and surfaces the Supabase error', async () => {
    const { result } = await renderResolvedAuth();
    fake.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(result.current.signIn('atleta@example.test', 'secreta')).rejects.toMatchObject({
      message: 'Invalid login credentials',
    });
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'atleta@example.test',
      password: 'secreta',
    });
  });

  it('sends the full name as metadata on signUp and returns its session', async () => {
    const { result } = await renderResolvedAuth();
    fake.auth.signUp.mockResolvedValue({ data: { user: fakeUser(), session: null }, error: null });

    // The database trigger creating the profile reads `full_name` from the
    // metadata, so the field has to travel with the sign-up call.
    await expect(result.current.signUp('atleta@example.test', 'secreta', 'Ana')).resolves.toEqual({
      session: null,
    });
    expect(fake.auth.signUp).toHaveBeenCalledWith({
      email: 'atleta@example.test',
      password: 'secreta',
      options: { data: { full_name: 'Ana' } },
    });
  });

  it('delegates signOut', async () => {
    const { result } = await renderResolvedAuth();

    await result.current.signOut();

    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

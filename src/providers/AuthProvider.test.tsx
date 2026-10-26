import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../hooks/useAuth.ts';
import { queryClient } from '../lib/queryClient.ts';
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
  // The provider reads the browser before it asks the SDK, and the key it
  // reads is derived from the project URL: both are pinned here so the test
  // does not depend on a local `.env`.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  localStorage.clear();

  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('useAuth', () => {
  it('fails loudly when used outside the provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});

describe('AuthProvider', () => {
  /**
   * The SDK removes the session even when the sign-out request cannot reach the
   * server, so SIGNED_OUT is the moment the account leaves this device. If the
   * cache were left behind, the next account would read A's dashboard, and a
   * paused write would resume with B's JWT.
   */
  it('clears the device data when the session ends', async () => {
    fake = createFakeSupabase(fakeSession());
    vi.mocked(getSupabase).mockResolvedValue(fake.client);

    await renderResolvedAuth();

    queryClient.setQueryData(['dashboard', fakeSession().user.id], { streak: 7 });

    act(() => {
      fake.emit('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['dashboard', fakeSession().user.id])).toBeUndefined();
    });
  });

  it('waits for the SDK when the browser holds a session', () => {
    // The browser holds a session, so only the SDK can say whether it is still
    // valid: a read that never settles is the only honest way to observe the
    // state the gate has to handle on every reload.
    const session = fakeSession();
    fake = createFakeSupabase(session);
    vi.mocked(getSupabase).mockResolvedValue(fake.client);
    fake.auth.getSession.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderAuth();

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('knows the visitor is signed out without waiting for the SDK', () => {
    // Nothing in the browser: the answer is already there, and the screen the
    // visitor is going to see should not wait for a network client to learn it.
    fake.auth.getSession.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderAuth();

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('does not ask for the SDK until the first paint is on the glass', async () => {
    // The SDK is 54 KiB that the login screen does not need. Asking for it
    // while the page is still painting is bandwidth the first paint pays for.
    renderAuth();

    expect(getSupabase).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(getSupabase).toHaveBeenCalled();
    });
  });

  it('asks for the SDK right away when the browser holds a session', () => {
    // With a session to validate, the app cannot paint the screens behind the
    // gate until the SDK answers, so there is nothing to wait for.
    fake = createFakeSupabase(fakeSession());
    vi.mocked(getSupabase).mockResolvedValue(fake.client);

    renderAuth();

    expect(getSupabase).toHaveBeenCalled();
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

    await waitFor(() => {
      expect(fake.auth.onAuthStateChange).toHaveBeenCalled();
    });

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
    fake = createFakeSupabase(fakeSession());
    vi.mocked(getSupabase).mockResolvedValue(fake.client);
    fake.auth.getSession.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderAuth();

    // Let the provider get as far as subscribing, then report an event while
    // the stored-session read is still pending.
    await waitFor(() => {
      expect(fake.auth.onAuthStateChange).toHaveBeenCalled();
    });

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

    await waitFor(() => {
      expect(fake.auth.onAuthStateChange).toHaveBeenCalled();
    });

    unmount();

    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('never asks for the SDK when it unmounts before the first paint', async () => {
    const { unmount } = renderAuth();

    unmount();

    // Long enough for the frame the SDK was waiting for to have happened.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(getSupabase).not.toHaveBeenCalled();
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

  it('sends the recovery email back to the reset screen', async () => {
    const { result } = await renderResolvedAuth();

    await result.current.sendPasswordReset('atleta@example.test');

    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('atleta@example.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it('updates the password and surfaces the Supabase error', async () => {
    const { result } = await renderResolvedAuth();
    fake.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'New password should be different from the old password.' },
    });

    await expect(result.current.updatePassword('nueva12345')).rejects.toMatchObject({
      message: 'New password should be different from the old password.',
    });
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'nueva12345' });
  });
});

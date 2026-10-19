import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authStorageKey, sessionState } from './stored-session.ts';

/**
 * The shape the SDK writes in `localStorage`. Only the fields the SDK itself
 * checks are here: the test is about the app reading the same place, not about
 * the SDK's internals.
 */
const STORED_SESSION = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 1_900_000_000,
  token_type: 'bearer',
  user: { id: 'user-id' },
};

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authStorageKey', () => {
  it('is the key the SDK writes, so both read the same place', () => {
    expect(authStorageKey()).toBe('sb-project-auth-token');
  });

  it('gives up when there is no URL to derive it from', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');

    expect(authStorageKey()).toBeNull();
  });
});

describe('sessionState', () => {
  it('knows the visitor is signed out when the browser holds nothing', () => {
    expect(sessionState()).toBe('signed-out');
  });

  it('does not guess when the browser holds a session', () => {
    localStorage.setItem('sb-project-auth-token', JSON.stringify(STORED_SESSION));

    expect(sessionState()).toBe('unknown');
  });

  it('does not guess when the stored value is not a session', () => {
    localStorage.setItem('sb-project-auth-token', JSON.stringify({ broken: true }));

    expect(sessionState()).toBe('signed-out');
  });

  it('finds a session the browser holds under another key', () => {
    // The key the SDK derives is a preference, not a requirement: what
    // matters is that the session is somewhere the SDK would look.
    localStorage.setItem('sb-other-auth-token', JSON.stringify(STORED_SESSION));

    expect(sessionState()).toBe('unknown');
  });

  it('does not guess when the URL carries the tokens of a link', () => {
    window.history.replaceState({}, '', '/reset-password#access_token=abc&refresh_token=def');

    expect(sessionState()).toBe('unknown');
  });

  it('does not guess when the URL carries a PKCE code', () => {
    window.history.replaceState({}, '', '/?code=abc');

    expect(sessionState()).toBe('unknown');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Supabase client is created lazily, on first use: the SDK is ~36 kB gzip
 * and the first paint needs none of it (budget rule, A8). These tests pin the
 * three properties that make a lazy singleton safe — nothing is created at
 * import time, it is created exactly once, and the configured project is what
 * the SDK receives — plus the failure mode when the environment is incomplete.
 *
 * The environment is stubbed so the suite never depends on a developer's `.env`
 * (CI has no such file), and every test imports the module fresh because the
 * client is memoized at module scope.
 */
const URL = 'https://example.supabase.co';
const KEY = 'sb_publishable_test_key';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@supabase/supabase-js');
});

describe('getSupabase', () => {
  it('creates nothing at import time and exactly one client afterwards', async () => {
    const calls: unknown[][] = [];

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: (...args: unknown[]) => {
        calls.push(args);

        return { from: () => undefined, auth: {} };
      },
    }));

    const { getSupabase } = await import('./supabase.ts');

    expect(calls).toHaveLength(0);

    await getSupabase();
    await getSupabase();

    expect(calls).toHaveLength(1);
  });

  it('hands the configured project, key and session options to the SDK', async () => {
    const calls: unknown[][] = [];

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: (...args: unknown[]) => {
        calls.push(args);

        return { from: () => undefined, auth: {} };
      },
    }));

    const { getSupabase } = await import('./supabase.ts');
    await getSupabase();

    const options = calls[0]?.[2] as { auth?: Record<string, unknown> } | undefined;

    expect(calls[0]?.[0]).toBe(URL);
    expect(calls[0]?.[1]).toBe(KEY);
    // The session must survive reloads: this is the point of the plan's
    // `persistSession` requirement, and the default could change under us.
    expect(options?.auth?.persistSession).toBe(true);
    expect(options?.auth?.autoRefreshToken).toBe(true);
  });

  it('returns the same client to concurrent and later callers', async () => {
    const { getSupabase } = await import('./supabase.ts');

    const [first, second] = await Promise.all([getSupabase(), getSupabase()]);

    expect(first).toBe(second);
    expect(await getSupabase()).toBe(first);
    expect(typeof first.from).toBe('function');
    expect(typeof first.auth.signInWithPassword).toBe('function');
  });

  it('fails naming VITE_SUPABASE_URL when it is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');

    const { getSupabase } = await import('./supabase.ts');

    await expect(getSupabase()).rejects.toThrow(/VITE_SUPABASE_URL/);
  });

  it('fails naming VITE_SUPABASE_PUBLISHABLE_KEY when it is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');

    const { getSupabase } = await import('./supabase.ts');

    await expect(getSupabase()).rejects.toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
  });
});

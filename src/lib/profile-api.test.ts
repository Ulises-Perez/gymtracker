import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { fetchProfile, updateWeightUnit } from './profile-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';

let fake: ReturnType<typeof createFakeSupabase>;

function lastBuilder() {
  return fake.from.mock.results.at(-1)?.value as { calls: string[] } | undefined;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.setTableResult('profiles', {
    data: [
      {
        username: 'ulise',
        full_name: 'Ulises',
        avatar_url: null,
        weight_unit: 'lb',
      },
    ],
    error: null,
  });
});

describe('fetchProfile', () => {
  it('renames the columns at the boundary and nowhere else', async () => {
    expect(await fetchProfile(USER_ID)).toEqual({
      username: 'ulise',
      fullName: 'Ulises',
      avatarUrl: null,
      weightUnit: 'lb',
    });
  });

  it('scopes the read to the user, even though RLS already does', async () => {
    await fetchProfile(USER_ID);

    expect(lastBuilder()?.calls).toContain(`eq id ${USER_ID}`);
  });

  it('reads a unit it does not know as kilos instead of showing it', async () => {
    fake.setTableResult('profiles', {
      data: [{ username: null, full_name: null, avatar_url: null, weight_unit: 'stones' }],
      error: null,
    });

    // Kilos is what the app stores, so an unknown value falls back to the truth rather than to a unit
    // nothing can format.
    expect((await fetchProfile(USER_ID)).weightUnit).toBe('kg');
  });

  it('reads a missing profile as something being wrong, not as an empty setup', async () => {
    fake.setTableResult('profiles', { data: [], error: null });

    // The row is created with the account, so there is no such thing as a user who has none.
    await expect(fetchProfile(USER_ID)).rejects.toThrow('Profile not found');
  });

  it('throws the error whole when the read is refused', async () => {
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });

    await expect(fetchProfile(USER_ID)).rejects.toThrow('permission denied');
  });
});

describe('updateWeightUnit', () => {
  it('writes the preference and nothing else', async () => {
    await updateWeightUnit(USER_ID, 'lb');

    /*
     * The assertion is on the columns being written, and that is the whole DoD of S9: switching the
     * unit must not touch a single weight. A write that carried `weight_kg` would rewrite history the
     * moment someone changed their mind about how to read it.
     */
    expect(lastBuilder()?.calls).toContain('update weight_unit');
    expect(lastBuilder()?.calls).not.toContain('update weight_kg');
    expect(lastBuilder()?.calls).toContain(`eq id ${USER_ID}`);
  });

  it('throws the error whole when the write is refused', async () => {
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });

    await expect(updateWeightUnit(USER_ID, 'kg')).rejects.toThrow('permission denied');
  });
});

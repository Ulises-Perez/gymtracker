import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import {
  bestStreak,
  fetchPrCount,
  fetchProfile,
  fetchWorkoutDates,
  updateAvatarUrl,
  updateFullName,
  updateWeightUnit,
} from './profile-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';

let fake: ReturnType<typeof createFakeSupabase>;

function lastBuilder() {
  return fake.from.mock.results.at(-1)?.value as { calls: string[] } | undefined;
}

/** A count response, which the double's result type does not name: PostgREST puts it beside `data`. */
function counted(count: number) {
  return { data: null, error: null, count };
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

/**
 * The name, and it writes the column the sign-up trigger fills.
 *
 * `handle_new_user()` inserts `profiles (id, full_name) VALUES (NEW.id,
 * NEW.raw_user_meta_data->>'full_name')`, so the "Nombre" typed at registration lands in
 * **`full_name`** — not in `username`, which is a `UNIQUE` column nothing writes. Editing the name
 * from the profile screen therefore has to touch the same column, or the screen would show one name
 * and store another.
 */
describe('updateFullName', () => {
  it('writes the name into full_name, and writes no other column', async () => {
    await updateFullName(USER_ID, 'Ulises Fernández');

    expect(lastBuilder()?.calls).toContain('update full_name=Ulises Fernández');
    expect(lastBuilder()?.calls).toContain(`eq id ${USER_ID}`);
  });

  it('stores a blank name as null, because a name nobody wrote is not a name', async () => {
    await updateFullName(USER_ID, '   ');

    expect(lastBuilder()?.calls).toContain('update full_name=null');
    expect(lastBuilder()?.calls).not.toContain('update full_name=   ');
  });

  it('throws the error whole when the write is refused', async () => {
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });

    await expect(updateFullName(USER_ID, 'Ulises')).rejects.toThrow('permission denied');
  });
});

/**
 * The avatar, and what is stored is the URL that serves it.
 *
 * `profiles.avatar_url` is the column, and what belongs in it is something an `<img>` can take
 * directly: the profile is read from the cache and drawn offline, so showing the avatar must not
 * wait on the storage client to rebuild a URL.
 */
describe('updateAvatarUrl', () => {
  it('writes the url into avatar_url, scoped to the user', async () => {
    const url = `https://project.supabase.co/storage/v1/object/public/avatars/${USER_ID}/avatar-1.png`;

    await updateAvatarUrl(USER_ID, url);

    expect(lastBuilder()?.calls).toContain(`update avatar_url=${url}`);
    expect(lastBuilder()?.calls).toContain(`eq id ${USER_ID}`);
  });

  it('throws the error whole when the write is refused', async () => {
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });

    await expect(updateAvatarUrl(USER_ID, 'https://example.test/a.png')).rejects.toThrow(
      'permission denied',
    );
  });
});

describe('updateWeightUnit', () => {
  it('writes the preference, and writes the unit it was handed', async () => {
    await updateWeightUnit(USER_ID, 'lb');

    /*
     * The assertion is on the column *and its value*, and that is the whole DoD of S9: switching the
     * unit must not touch a single weight. A write that carried `weight_kg` would rewrite history the
     * moment someone changed their mind about how to read it — and a write of a hardcoded unit would
     * leave the preference exactly where it was while a suite that only looked at column names stayed
     * green.
     */
    expect(lastBuilder()?.calls).toContain('update weight_unit=lb');
    expect(lastBuilder()?.calls.some((call) => call.includes('weight_kg'))).toBe(false);
    expect(lastBuilder()?.calls).toContain(`eq id ${USER_ID}`);
  });

  it('writes kilos when kilos is what was asked for, not a fixed value', async () => {
    await updateWeightUnit(USER_ID, 'kg');

    // The other half of the same pin: the value written is the argument, not a constant.
    expect(lastBuilder()?.calls).toContain('update weight_unit=kg');
  });

  it('throws the error whole when the write is refused', async () => {
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });

    await expect(updateWeightUnit(USER_ID, 'kg')).rejects.toThrow('permission denied');
  });
});

/**
 * The best streak, derived and never stored.
 *
 * `dashboard_summary()` returns the streak that ends today, which is reset by missing a day; the figure
 * the profile shows is the longest one the user has ever had, so it has to be computed from the days
 * they trained. No column and no migration: the days are already in `workouts`.
 */
describe('bestStreak', () => {
  it('is the longest run of consecutive days, not the one ending today', () => {
    // Three in a row, a gap, then two: the best is three, while the run ending today is two.
    expect(bestStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'])).toBe(
      3,
    );
  });

  it('counts a day once when it was trained twice, and needs at least one day', () => {
    expect(bestStreak(['2026-10-01', '2026-10-01', '2026-10-02'])).toBe(2);
    expect(bestStreak([])).toBe(0);
  });
});

/**
 * The days the best streak is computed from: every live workout of the user, and no other row.
 */
describe('fetchWorkoutDates', () => {
  it('reads every live workout date of the user, paged past the PostgREST cap', async () => {
    const firstPage = Array.from({ length: 1000 }, () => ({ date: '2026-10-01' }));
    fake.setTableResults('workouts', [
      { data: firstPage, error: null },
      { data: [{ date: '2026-10-02' }], error: null },
    ]);

    const dates = await fetchWorkoutDates(USER_ID);

    // One request would silently truncate the history, and a truncated history is a wrong streak.
    expect(fake.from).toHaveBeenCalledTimes(2);
    expect(dates).toHaveLength(1001);

    const calls = fake.from.mock.results.flatMap(
      (result) => (result.value as { calls: string[] }).calls,
    );

    expect(calls).toContain(`eq user_id ${USER_ID}`);
    expect(calls).toContain('is deleted_at null');
    expect(calls).toContain('range 0 999');
    expect(calls).toContain('range 1000 1999');
  });
});

/**
 * The total of records, and it has to be a count of the rows themselves.
 *
 * `recent_prs` in the summary comes back capped at five, so it can never say how many records there
 * are; one row per exercise with a live record is the number the profile wants.
 */
describe('fetchPrCount', () => {
  it('takes the exact count of the user’s record rows', async () => {
    fake.setTableResult('personal_records', counted(12));

    expect(await fetchPrCount(USER_ID)).toBe(12);
    expect(lastBuilder()?.calls).toContain('select id');
    expect(lastBuilder()?.calls).toContain(`eq user_id ${USER_ID}`);
  });
});

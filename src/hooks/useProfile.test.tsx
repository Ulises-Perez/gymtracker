import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { useProfile, useUpdateWeightUnit, useWeightUnit } from './useProfile.ts';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function profileRow(weightUnit: string) {
  return { username: 'ulise', full_name: 'Ulises', avatar_url: null, weight_unit: weightUnit };
}

/** Every column-and-value the builders wrote, so a weight in the write would be visible here. */
function writtenCalls(): string[] {
  return fake.from.mock.results
    .flatMap((result) => (result.value as { calls?: string[] }).calls ?? [])
    .filter((call) => call.startsWith('update'));
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  fake.setTableResult('profiles', { data: [profileRow('lb')], error: null });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('useProfile', () => {
  it('reads the profile for the user in the key', async () => {
    const { result } = renderHook(() => useProfile(USER_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.weightUnit).toBe('lb');
    });

    // Scoped to the user even though RLS already does: the key carries the owner so a shared device
    // cannot serve one account the other's profile from the cache.
    const calls = fake.from.mock.results.flatMap((r) => (r.value as { calls: string[] }).calls);

    expect(calls).toContain(`eq id ${USER_ID}`);
  });

  it('asks the server for nothing while there is no user to ask for', () => {
    const { result } = renderHook(() => useProfile(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe('useWeightUnit', () => {
  it('hands the reading screens the stored unit', async () => {
    const { result } = renderHook(() => useWeightUnit(USER_ID), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe('lb');
    });
  });

  /**
   * The app stores kilos, so that is the fallback: a screen that reads the preference must still
   * render while the profile is on its way, and if it never arrives the stored unit is the truth
   * rather than a unit nothing can format.
   */
  it('reads as kilos while there is no user, and asks for nothing', () => {
    const { result } = renderHook(() => useWeightUnit(''), { wrapper });

    expect(result.current).toBe('kg');
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('reads as kilos when the profile cannot be read', async () => {
    fake.setTableResult('profiles', { data: [], error: null });

    const { result } = renderHook(() => useWeightUnit(USER_ID), { wrapper });

    await waitFor(() => {
      expect(client.getQueryState(['profile', USER_ID])?.status).toBe('error');
    });
    expect(result.current).toBe('kg');
  });
});

describe('useUpdateWeightUnit', () => {
  /**
   * The preference is written and nothing else, and the profile is invalidated so every reading
   * screen follows: this test mounts the reading side and watches it change after the write.
   */
  it('writes the preference and makes the reading screens follow, without writing a weight', async () => {
    const { result } = renderHook(
      () => ({ profile: useProfile(USER_ID), update: useUpdateWeightUnit(USER_ID) }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.profile.data?.weightUnit).toBe('lb');
    });

    fake.setTableResult('profiles', { data: [profileRow('kg')], error: null });
    result.current.update.mutate('kg');

    await waitFor(() => {
      expect(result.current.profile.data?.weightUnit).toBe('kg');
    });

    // The column and its value: switching kg/lb must not touch a single stored weight (S9).
    expect(writtenCalls()).toContain('update weight_unit=kg');
    expect(writtenCalls().some((call) => call.includes('weight_kg'))).toBe(false);
  });

  it('says so instead of pretending it saved when the write is refused', async () => {
    fake.setTableResult('profiles', { data: null, error: { message: 'permission denied' } });

    const { result } = renderHook(() => useUpdateWeightUnit(USER_ID), { wrapper });

    result.current.mutate('lb');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

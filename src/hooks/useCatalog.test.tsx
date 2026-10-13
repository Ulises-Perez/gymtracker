import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { useCatalog, useLastSets } from './useCatalog.ts';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-a000-000000000002';

const EXERCISE_ROW = {
  id: '01920000-0000-7000-8000-000000000010',
  name: 'Press Banca',
  muscle_group_id: null,
  is_custom: false,
};

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.setTableResult('exercises', { data: [EXERCISE_ROW], error: null });
  fake.setTableResult('muscle_groups', {
    data: [{ id: 'mg-1', name: 'Pecho', icon: '🫁' }],
    error: null,
  });

  client = createQueryClient();
});

describe('useCatalog', () => {
  it('hands the picker both halves of the catalogue', async () => {
    const { result } = renderHook(() => useCatalog(USER_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.exercises).toHaveLength(1);
    });

    expect(result.current.data?.muscleGroups).toEqual([{ id: 'mg-1', name: 'Pecho', icon: '🫁' }]);
  });

  /**
   * The screen sits behind the auth gate, so an empty id means the gate has not
   * resolved yet — not a user with no exercises. A request keyed by it can only be
   * refused, and it would be made on every render of a screen that is about to be
   * replaced by the skeleton anyway.
   */
  it('asks the server for nothing while there is no user to ask for', () => {
    const { result } = renderHook(() => useCatalog(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.from).not.toHaveBeenCalled();
  });

  /**
   * The cache lives in IndexedDB and outlives a session. If the entry were keyed
   * by 'catalog' alone, a second account signing in on the same device would be
   * served the first one's catalogue — custom exercises included — without a
   * single request. The user id is part of the key for that reason.
   */
  it('keeps one cache entry per user on a shared device', async () => {
    const first = renderHook(({ userId }) => useCatalog(userId), {
      wrapper,
      initialProps: { userId: USER_ID },
    });

    await waitFor(() => {
      expect(first.result.current.data).toBeTruthy();
    });

    first.rerender({ userId: OTHER_USER_ID });

    await waitFor(() => {
      expect(client.getQueryCache().getAll()).toHaveLength(2);
    });

    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual(
      expect.arrayContaining([
        ['catalog', USER_ID],
        ['catalog', OTHER_USER_ID],
      ]),
    );
  });

  /**
   * The catalogue almost never changes, so it is fetched once and kept: that is
   * what makes the picker instant and fully offline. The persister's 7-day
   * `maxAge` is what eventually refreshes it, not a refetch on navigation.
   */
  it('does not refetch when the screen is opened again', async () => {
    const first = renderHook(() => useCatalog(USER_ID), { wrapper });

    await waitFor(() => {
      expect(first.result.current.data).toBeTruthy();
    });

    const requests = fake.from.mock.calls.length;
    first.unmount();

    const second = renderHook(() => useCatalog(USER_ID), { wrapper });

    await waitFor(() => {
      expect(second.result.current.data).toBeTruthy();
    });

    expect(fake.from.mock.calls.length).toBe(requests);
  });
});

describe('useLastSets', () => {
  it('asks for the last sets of the exercise it was given', async () => {
    fake.rpc.mockResolvedValue({
      data: [{ set_number: 1, reps: 10, weight_kg: '72.50' }],
      error: null,
    });

    const { result } = renderHook(() => useLastSets('exercise-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ setNumber: 1, reps: 10, weightKg: 72.5 }]);
    });
  });

  it('stays quiet with no exercise to look up', async () => {
    // A card added a moment ago has no id yet; a request per keystroke would be
    // noise, so the query is disabled instead of sent with an empty id.
    renderHook(() => useLastSets(''), { wrapper });

    await Promise.resolve();

    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

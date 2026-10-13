import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import type { QueryBuilderStub } from '../testing/fake-supabase.ts';
import { fetchCatalog, fetchLastSets } from './catalog-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';

const EXERCISE_ROW = {
  id: '01920000-0000-7000-8000-000000000010',
  name: 'Press Banca',
  muscle_group_id: '01920000-0000-7000-8000-000000000020',
  is_custom: false,
};

let fake: ReturnType<typeof createFakeSupabase>;

/**
 * The builder `supabase.from(table)` handed over during this call.
 *
 * The assertion is on the query's *shape* —soft-delete filter, owner scoping,
 * ordering— because there is no other observable that proves them: the result
 * comes from a stub either way, so a dropped filter would only show up as a wrong
 * list in production.
 */
function builderForTable(table: string): QueryBuilderStub {
  const index = fake.from.mock.calls.findIndex(([name]) => name === table);

  return fake.from.mock.results[index]?.value as QueryBuilderStub;
}

beforeEach(() => {
  fake = createFakeSupabase();

  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

describe('fetchCatalog', () => {
  it('hides soft-deleted exercises and scopes them to the global catalogue plus mine', async () => {
    await fetchCatalog(USER_ID);

    expect(builderForTable('exercises').calls).toEqual([
      'select id, name, muscle_group_id, is_custom',
      // The soft-delete convention is the client's job: RLS does not filter it.
      'is deleted_at null',
      // A custom exercise is readable by everyone under the deployed policy, so
      // the scoping that keeps strangers' exercises out of the modal is here.
      `or is_custom.eq.false,is_custom.is.null,created_by.eq.${USER_ID}`,
      'order name',
    ]);
  });

  it('renames the columns the screens read', async () => {
    fake.setTableResult('exercises', { data: [EXERCISE_ROW], error: null });

    const { exercises } = await fetchCatalog(USER_ID);

    expect(exercises).toEqual([
      {
        id: EXERCISE_ROW.id,
        name: 'Press Banca',
        muscleGroupId: EXERCISE_ROW.muscle_group_id,
        isCustom: false,
      },
    ]);
  });

  it('reads the muscle groups, which carry no soft-delete column', async () => {
    fake.setTableResult('muscle_groups', {
      data: [{ id: 'mg-1', name: 'Pecho', icon: '🫁' }],
      error: null,
    });

    const { muscleGroups } = await fetchCatalog(USER_ID);

    expect(muscleGroups).toEqual([{ id: 'mg-1', name: 'Pecho', icon: '🫁' }]);
  });

  it('fails loudly instead of reporting an empty catalogue', async () => {
    // An empty catalogue and a denied query look identical on screen — the picker
    // is just empty — so the error has to survive as an error.
    fake.setTableResult('exercises', { data: null, error: { message: 'permission denied' } });

    await expect(fetchCatalog(USER_ID)).rejects.toThrow(/permission denied/);
  });
});

describe('fetchLastSets', () => {
  it('turns the DECIMAL strings into numbers at the boundary', async () => {
    // A5: supabase-js returns `numeric` as a string. Anything that did arithmetic
    // on the raw value would concatenate instead of adding.
    fake.rpc.mockResolvedValue({
      data: [
        { set_number: 1, reps: 10, weight_kg: '72.50' },
        { set_number: 2, reps: 8, weight_kg: '80.00' },
      ],
      error: null,
    });

    const sets = await fetchLastSets('exercise-1');

    expect(sets).toEqual([
      { setNumber: 1, reps: 10, weightKg: 72.5 },
      { setNumber: 2, reps: 8, weightKg: 80 },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith('last_weight_for_exercise', {
      p_exercise_id: 'exercise-1',
    });
  });

  it('survives a set with no weight recorded', async () => {
    fake.rpc.mockResolvedValue({
      data: [{ set_number: 1, reps: null, weight_kg: null }],
      error: null,
    });

    expect(await fetchLastSets('exercise-1')).toEqual([{ setNumber: 1, reps: null, weightKg: 0 }]);
  });

  it('reports an exercise with no history as no sets, not as an error', async () => {
    fake.rpc.mockResolvedValue({ data: [], error: null });

    expect(await fetchLastSets('exercise-1')).toEqual([]);
  });

  it('fails loudly when the RPC is rejected', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'Not authenticated' } });

    await expect(fetchLastSets('exercise-1')).rejects.toThrow(/Not authenticated/);
  });
});

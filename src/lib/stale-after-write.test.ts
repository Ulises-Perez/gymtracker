import { QueryClient } from '@tanstack/query-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { markStaleAfterDelete, markStaleAfterSave } from './stale-after-write.ts';

/**
 * The reads a workout write changes, and the ones a delete changes.
 *
 * The list is the project's own: a read that looks at the rows a workout write
 * touches and is not marked keeps answering with what it knew before it. The
 * two keys that were missing are the ones a write changes and a delete changes
 * in a visible way: the profile's derived figures ("Mejor racha" comes from the
 * dates of the workouts, "Récords" from the records the write moves) and the
 * detail of the workout itself, which after a delete is a workout that is gone.
 */
const USER_ID = '00000000-0000-4000-a000-000000000001';
const WORKOUT_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 60_000 } },
  });
});

function seedReads() {
  client.setQueryData(['dashboard', USER_ID], { streak: 1 });
  client.setQueryData(['profile-stats', USER_ID], { totalPrs: 1 });
  client.setQueryData(['workout', USER_ID, WORKOUT_ID], { id: WORKOUT_ID });
  client.setQueryData(['history', USER_ID], { items: [] });
  client.setQueryData(['progress', USER_ID, 'exercise'], { series: [] });
  client.setQueryData(['last-sets', USER_ID, 'exercise'], { sets: [] });
  client.setQueryData(['catalog', USER_ID], { exercises: [] });
}

function invalidated(key: readonly string[]): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

describe('markStaleAfterSave', () => {
  it('marks every read the write changed', () => {
    seedReads();

    markStaleAfterSave(client);

    expect(invalidated(['dashboard', USER_ID])).toBe(true);
    expect(invalidated(['profile-stats', USER_ID])).toBe(true);
    expect(invalidated(['workout', USER_ID, WORKOUT_ID])).toBe(true);
    expect(invalidated(['history', USER_ID])).toBe(true);
    expect(invalidated(['progress', USER_ID, 'exercise'])).toBe(true);
    expect(invalidated(['last-sets', USER_ID, 'exercise'])).toBe(true);
    expect(invalidated(['catalog', USER_ID])).toBe(true);
  });
});

describe('markStaleAfterDelete', () => {
  it('marks the same reads, and the catalogue too, because deleting removes no exercise', () => {
    seedReads();

    markStaleAfterDelete(client);

    expect(invalidated(['dashboard', USER_ID])).toBe(true);
    expect(invalidated(['profile-stats', USER_ID])).toBe(true);
    expect(invalidated(['workout', USER_ID, WORKOUT_ID])).toBe(true);
    expect(invalidated(['history', USER_ID])).toBe(true);
    expect(invalidated(['progress', USER_ID, 'exercise'])).toBe(true);
    expect(invalidated(['last-sets', USER_ID, 'exercise'])).toBe(true);
  });
});

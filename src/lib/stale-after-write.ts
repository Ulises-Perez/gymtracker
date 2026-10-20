import type { QueryClient } from '@tanstack/query-core';

/**
 * The reads a workout write makes stale.
 *
 * `save_workout` is one event that changes several screens, and each of them is cached: the
 * catalogue gains the custom exercises the session invented, the history gains the workout, the
 * summary gains its streak and its totals, and the exercise's progress and its "last time" hint gain
 * its series. Every one of them is cached with a `staleTime` measured in minutes, so a read that is
 * not marked answers with what it knew before the write — and the loudest version of that is the
 * list saying "Todavía no registraste ningún entrenamiento" about the session the user just
 * finished, which is what the end-to-end suite caught.
 *
 * Deleting a workout is the same kind of event: the rows it read are soft-deleted, and every read
 * that looked at them answers with a workout that is already gone. The Inicio is where it shows:
 * the summary it reads is cached, so without being told it keeps showing a streak and a last
 * workout that do not exist any more.
 *
 * One list rather than one invalidation per screen, because there are more than two call sites —
 * the live save, the subscription that hears a resumed one and the delete — and the way they stop
 * agreeing is a screen being added to only one of them.
 *
 * The keys are prefixes, as `['catalog']` already was: `['progress']` covers every exercise and
 * `['history']` every account, because the write does not say which exercises it touched until after
 * it lands, and naming them would leave the rest stale.
 */
const STALE_AFTER_SAVE = [
  ['catalog'],
  ['history'],
  ['dashboard'],
  ['progress'],
  ['last-sets'],
] as const;

/**
 * The same reads, without the catalogue: deleting a workout removes no exercise, so the catalogue
 * has nothing new to say.
 */
const STALE_AFTER_DELETE = [['history'], ['dashboard'], ['progress'], ['last-sets']] as const;

/**
 * Marks them stale without refetching, which is the choice both call sites already made for the
 * catalogue: a background request deciding the moment could turn a cached read into an error screen
 * while the user is offline. Each of these screens refetches when it is next opened, which is when
 * someone is looking at it.
 */
export function markStaleAfterSave(client: QueryClient): void {
  markStale(client, STALE_AFTER_SAVE);
}

export function markStaleAfterDelete(client: QueryClient): void {
  markStale(client, STALE_AFTER_DELETE);
}

function markStale(client: QueryClient, keys: readonly (readonly string[])[]): void {
  for (const queryKey of keys) {
    void client.invalidateQueries({ queryKey, refetchType: 'none' });
  }
}

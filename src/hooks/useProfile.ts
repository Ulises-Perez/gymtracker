import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchProfile, updateWeightUnit } from '../lib/profile-api.ts';
import type { WeightUnit } from '../lib/units.ts';

/**
 * The user's own settings, in the cache.
 *
 * The user id is part of the key for the same reason it is in the catalogue and the history: the
 * cache outlives the session, so on a shared device the second account must not be served the first
 * one's profile.
 *
 * Disabled rather than sent with an empty id, like every read behind the auth gate: an empty id
 * means the gate has not resolved yet, and a request keyed by it can only be refused.
 *
 * This key is shared on purpose. The profile screen reads and writes it, and every reading screen
 * reads it through `useWeightUnit` below, so one invalidation after the preference changes is what
 * makes the whole app follow — no second source for the unit, and no prop threaded through a tree.
 */
export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId),
    enabled: userId !== '',
  });
}

/**
 * The unit the *reading* screens show weights in.
 *
 * Kilos while the profile is on its way, and kilos if it cannot be read: the app stores kilos, so the
 * fallback is the storage unit — the truth — and not a unit nothing can format. What matters is that
 * a screen still renders when the profile request is slow or offline; the number it shows in the
 * meantime is the stored one.
 *
 * The entry screens deliberately do not call this, and that is the rule this hook exists to keep on
 * one side of the line. `WorkoutExerciseCard` and `PersonalRecords` live on the screen where kilos
 * are typed, and they stay in kilos whatever this returns: a reference in pounds next to a field in
 * kilos stops being usable for the only thing it is for — comparing against what you are about to
 * lift. A screen cannot speak two units. The guard test lives next to the preference; those two
 * component files are left untouched on purpose.
 */
export function useWeightUnit(userId: string): WeightUnit {
  const profile = useProfile(userId);

  return profile.data?.weightUnit ?? 'kg';
}

/**
 * Remembers which unit to read weights in.
 *
 * It writes the preference and never a weight — `updateWeightUnit` is the one write and it touches
 * one column — which is the definition of done of S9 in one call: switching kg/lb must not alter a
 * single stored weight.
 *
 * On success it invalidates the profile key, and that is what makes the choice visible everywhere:
 * every reading screen reads the unit from this same query, so refetching it re-renders them in the
 * unit the user just picked.
 */
export function useUpdateWeightUnit(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (unit: WeightUnit) => updateWeightUnit(userId, unit),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}

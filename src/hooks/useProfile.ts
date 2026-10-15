import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { removeAvatarObject, uploadAvatarObject } from '../lib/avatar-api.ts';
import { fetchBodyWeights, saveBodyWeight } from '../lib/body-weight-api.ts';
import {
  fetchProfile,
  updateAvatarUrl,
  updateFullName,
  updateWeightUnit,
} from '../lib/profile-api.ts';
import type { Profile } from '../lib/profile-api.ts';
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

/**
 * Renames the user.
 *
 * It writes `full_name`, the same column `handle_new_user()` fills when the account is created, so the
 * name the user typed at registration is the name this screen edits — there is no second one to keep
 * in sync. `username` is a `UNIQUE` column that no path in this app writes, so there is no duplicate
 * to catch here either.
 *
 * The profile key is invalidated on success, like the unit preference: every read of the profile goes
 * through the same key, so refetching it is what makes the new name appear instead of a second copy of
 * the state living in the screen.
 */
export function useUpdateFullName(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fullName: string) => updateFullName(userId, fullName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}

/**
 * Replaces the avatar.
 *
 * Three steps, and their order is the whole point:
 *
 * 1. the new file goes into the bucket, under a name nothing else uses;
 * 2. the profile is pointed at it — this is the write that makes it the live avatar;
 * 3. the object the profile pointed at before is deleted, best effort.
 *
 * Deleting before step 2 would be able to take away the avatar that is still in use, so the previous
 * URL is the one read from the cache *before* the upload, and `removeAvatarObject` refuses anything
 * outside the caller's own folder. A failure in step 3 does not fail the replacement: the new avatar
 * is already stored and visible, and an orphaned object is a cost, not a wrong screen. A failure in
 * step 2 leaves the uploaded file with nothing pointing at it, so it is taken back out and the error
 * still travels — the user has to be told the avatar did not save.
 */
export function useUploadAvatar(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const previous = queryClient.getQueryData<Profile>(['profile', userId])?.avatarUrl ?? null;
      const url = await uploadAvatarObject(userId, file);

      try {
        await updateAvatarUrl(userId, url);
      } catch (caught) {
        await removeAvatarObject(userId, url).catch(() => undefined);
        throw caught;
      }

      await removeAvatarObject(userId, previous).catch(() => undefined);

      return url;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}

/**
 * The body weight the user has logged, in the cache.
 *
 * Keyed by the user like every other read here: the cache outlives the session, so on a shared device
 * the second account must not be served the first one's weight.
 */
export function useBodyWeights(userId: string) {
  return useQuery({
    queryKey: ['body-weights', userId],
    queryFn: () => fetchBodyWeights(userId),
    enabled: userId !== '',
  });
}

/**
 * Logs the weight of one day.
 *
 * The day is the key of a measurement (`0006`), so logging today again updates the row that is already
 * there; `saveBodyWeight` is what reads the live row and decides between the update and the insert.
 *
 * On success the read is invalidated, so the chart and the figures follow the entry that just landed.
 */
export function useSaveBodyWeight(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entry: { date: string; weightKg: number }) =>
      saveBodyWeight(userId, entry.date, entry.weightKg),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['body-weights', userId] });
    },
  });
}

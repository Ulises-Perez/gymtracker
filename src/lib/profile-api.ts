import type { WeightUnit } from './units.ts';
import { getSupabase } from './supabase.ts';

/**
 * The user's own settings.
 *
 * `profiles` is one row per user, and its `id` is the user's id — there is no separate `user_id` — so
 * everything here is scoped by that. The RLS policy scopes it too, which is why the reads and writes
 * below are belt and braces rather than a security boundary.
 */

export type Profile = {
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  weightUnit: WeightUnit;
};

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  weight_unit: string | null;
};

/**
 * Anything that is not pounds is kilos.
 *
 * The column is free text, so a value this build does not know — one written by a later version, or by
 * hand — must not reach a screen as a unit nothing can format. Kilos is the app's own storage unit, so
 * falling back to it is falling back to the truth.
 */
function toWeightUnit(value: string | null): WeightUnit {
  return value === 'lb' ? 'lb' : 'kg';
}

export function toProfile(row: ProfileRow): Profile {
  return {
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    weightUnit: toWeightUnit(row.weight_unit),
  };
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('profiles')
    .select('username, full_name, avatar_url, weight_unit')
    .eq('id', userId)
    // Ending the chain on an order, like every other read in this project: a query has to settle
    // somewhere, and settling on a defined order is what makes the result deterministic.
    .order('id');

  if (error) {
    throw error;
  }

  const first = (data as ProfileRow[])[0];

  if (!first) {
    // A profile row is created with the account (a trigger), so its absence means something is wrong
    // rather than that the user has not set anything up.
    throw new Error('Profile not found');
  }

  return toProfile(first);
}

/**
 * Remembers which unit to show weights in.
 *
 * Only the preference is written and never a weight: the unit is how the app talks, not what it
 * stores, so changing it must leave every `weight_kg` exactly where it was. That is the DoD of S9 in
 * one function.
 */
export async function updateWeightUnit(userId: string, unit: WeightUnit): Promise<void> {
  const supabase = await getSupabase();

  const { error } = await supabase.from('profiles').update({ weight_unit: unit }).eq('id', userId);

  if (error) {
    throw error;
  }
}

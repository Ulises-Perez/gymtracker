import { saveWorkoutResultSchema, saveWorkoutVariablesSchema } from '../schemas/workout.ts';
import type { SaveWorkoutResult } from '../schemas/workout.ts';
import { getSupabase } from './supabase.ts';

/**
 * The one write path into the database.
 *
 * A live save and a resumed one run this same function, which is the property
 * that makes the offline queue trustworthy: if the queue had its own code path,
 * a restored write could quietly behave differently from a fresh one and nobody
 * would notice until it corrupted data.
 *
 * This module is reached only through `import()` from the dispatcher, so Zod and
 * the Supabase SDK land in a deferred chunk rather than the initial bundle
 * (decision of 2026-10-11, T2.1). That is also why validation lives here and not
 * in the dispatcher: the dispatcher is in the initial bundle and must stay free
 * of both.
 */
export async function saveWorkout(variables: unknown): Promise<SaveWorkoutResult> {
  // Parsed, not cast. This is the boundary where a payload that survived
  // serialisation — or predates the current schema — gets stopped.
  const { payload } = saveWorkoutVariablesSchema.parse(variables);

  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('save_workout', { payload });

  if (error) {
    // Rethrown whole: the Postgrest error carries the code the UI maps to a
    // Spanish message, and dropping it would leave only prose to match on.
    throw error;
  }

  return saveWorkoutResultSchema.parse(data);
}

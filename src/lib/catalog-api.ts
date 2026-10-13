import { getSupabase } from './supabase.ts';
import { toNumber } from './utils.ts';

/**
 * Reads for the exercise picker.
 *
 * This module is the boundary where the database's shape stops and the screens'
 * shape starts: columns are renamed to camelCase and, more importantly, `DECIMAL`
 * columns are converted here and nowhere else (A5). A raw `weight_kg` comes back
 * from supabase-js as a string, so arithmetic on it concatenates instead of
 * adding. Doing the conversion once, at the point of read, is what makes the rule
 * enforceable; trusting every consumer to remember it is not.
 */

export type CatalogExercise = {
  id: string;
  name: string;
  muscleGroupId: string | null;
  isCustom: boolean;
};

export type MuscleGroup = {
  id: string;
  name: string;
  icon: string | null;
};

export type Catalog = {
  exercises: CatalogExercise[];
  muscleGroups: MuscleGroup[];
};

export type LastSet = {
  setNumber: number;
  reps: number | null;
  weightKg: number;
};

export async function fetchCatalog(userId: string): Promise<Catalog> {
  const supabase = await getSupabase();

  const [exercises, muscleGroups] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, name, muscle_group_id, is_custom')
      // Soft delete is the client's job; RLS does not filter it (PLAN section 4.1).
      .is('deleted_at', null)
      // The deployed SELECT policy is `USING (true)`, so without this the picker
      // would list other people's custom exercises. That policy needs tightening
      // on the server — this scoping is what keeps the screen honest meanwhile,
      // and it is not a substitute for the fix.
      .or(`is_custom.eq.false,is_custom.is.null,created_by.eq.${userId}`)
      .order('name'),
    supabase.from('muscle_groups').select('id, name, icon').order('name'),
  ]);

  if (exercises.error) {
    throw exercises.error;
  }

  if (muscleGroups.error) {
    throw muscleGroups.error;
  }

  return {
    exercises: (exercises.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      muscleGroupId: row.muscle_group_id,
      isCustom: row.is_custom ?? false,
    })),
    muscleGroups: muscleGroups.data ?? [],
  };
}

/**
 * The sets of the most recent workout that used this exercise.
 *
 * It answers the "último: 3×10 @ 70 kg" reference on the card and seeds a new
 * set's defaults, so it is read per exercise and not cached for long.
 */
export async function fetchLastSets(exerciseId: string): Promise<LastSet[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('last_weight_for_exercise', {
    p_exercise_id: exerciseId,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    setNumber: row.set_number,
    reps: row.reps,
    // A5 again, at the only place that knows this column is `numeric`.
    weightKg: toNumber(row.weight_kg),
  }));
}

import type { QueuedMutationVariables } from '../lib/queued-mutations.ts';
import type { SaveWorkoutPayload } from '../schemas/workout.ts';

/**
 * A complete, valid `save-workout` entry.
 *
 * The payload is wide and every queue test needs one that parses, so it lives
 * here rather than being hand-rolled per file: three copies would drift the day
 * the schema gains a field, and the failure would look like a broken test rather
 * than a stale fixture.
 */
export const saveWorkoutPayloadFixture: SaveWorkoutPayload = {
  id: '01920000-0000-7000-8000-000000000001',
  date: '2026-10-13',
  title: 'Empuje',
  notes: null,
  duration_minutes: 52,
  sets: [
    {
      id: '01920000-0000-7000-8000-000000000002',
      exercise_id: '01920000-0000-7000-8000-000000000003',
      set_number: 1,
      reps: 5,
      weight_kg: 100,
      rpe: null,
      is_warmup: false,
      notes: null,
    },
  ],
};

export function queuedSaveWorkout(
  payload: Partial<SaveWorkoutPayload> = {},
): QueuedMutationVariables {
  return {
    kind: 'save-workout',
    payload: { ...saveWorkoutPayloadFixture, ...payload },
  };
}

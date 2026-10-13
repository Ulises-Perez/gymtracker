import { useMemo, useState } from 'react';

import { ExercisePickerDialog } from '../components/workout/ExercisePickerDialog.tsx';
import { WorkoutExerciseCard } from '../components/workout/WorkoutExerciseCard.tsx';
import { Input } from '../components/ui/Input.tsx';
import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { useRestTimer } from '../hooks/useRestTimer.ts';
import { useSaveWorkout } from '../hooks/useSaveWorkout.ts';
import { useWakeLock } from '../hooks/useWakeLock.ts';
import type { CatalogExercise } from '../lib/catalog-api.ts';
import { toSaveWorkoutPayload } from '../lib/workout-payload.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';

/**
 * The workout screen.
 *
 * This is where everything the phase built meets: the draft in IndexedDB, the catalogue
 * in TanStack Query, the picker, the cards, the rest timer and the wake lock. The screen
 * owns no workout data of its own — it reads the draft and calls the store — which is
 * what keeps a session safe across a reload or a dead battery.
 *
 * Two states that look alike are kept apart on purpose: waiting for the stored draft to
 * be read, and there being no draft. Rendering a fresh workout during the first one would
 * replace the restored session under the user's hands, so the wait shows its own skeleton.
 */

/**
 * How long a rest lasts.
 *
 * A constant rather than a setting: the plan asks for a rest timer, not for a preference,
 * and inventing the storage for one now would be a decision nobody asked for.
 */
const REST_SECONDS = 120;

export function WorkoutPage() {
  const { user } = useAuth();

  const hydrated = useWorkoutStore((state) => state.hydrated);
  const draft = useWorkoutStore((state) => state.draft);
  const start = useWorkoutStore((state) => state.start);
  const setTitle = useWorkoutStore((state) => state.setTitle);
  const addExercise = useWorkoutStore((state) => state.addExercise);
  const addCustomExercise = useWorkoutStore((state) => state.addCustomExercise);
  const removeExercise = useWorkoutStore((state) => state.removeExercise);
  const addSet = useWorkoutStore((state) => state.addSet);
  const updateSet = useWorkoutStore((state) => state.updateSet);
  const removeSet = useWorkoutStore((state) => state.removeSet);

  const [pickerOpen, setPickerOpen] = useState(false);

  const catalog = useCatalog(user?.id ?? '');
  const rest = useRestTimer(REST_SECONDS);
  const save = useSaveWorkout();

  const customs = draft?.customExercises;
  const isOpen = draft?.status === 'draft';

  // Held while a workout is open: the phone locking mid-set is the thing this exists for.
  useWakeLock(isOpen === true);

  /**
   * The custom exercises of this session, in the shape the picker lists.
   *
   * They come from the draft and not from the catalogue, because the catalogue is the
   * server's copy and these rows do not exist there until the workout is saved.
   */
  const localExercises = useMemo<CatalogExercise[]>(
    () =>
      (customs ?? []).map((custom) => ({
        id: custom.id,
        name: custom.name,
        muscleGroupId: custom.muscleGroupId,
        isCustom: true,
      })),
    [customs],
  );

  /**
   * What each card is called.
   *
   * The draft holds only the exercise id, so the name is looked up here: from the
   * catalogue for a shared exercise, and from the draft's own definitions for one the
   * user invented. Nothing is stored on the card, so renaming an exercise in the
   * catalogue never needs the sessions to be migrated.
   */
  const names = useMemo(() => {
    const lookup = new Map<string, string>();

    for (const exercise of catalog.data?.exercises ?? []) {
      lookup.set(exercise.id, exercise.name);
    }

    for (const custom of customs ?? []) {
      lookup.set(custom.id, custom.name);
    }

    return lookup;
  }, [catalog.data, customs]);

  /**
   * Queues the frozen session again after a failed write.
   *
   * `finishAndQueue` refuses a draft that is no longer open — correctly, since `finish()`
   * is what sets `endedAt` — so a retry rebuilds the payload from the same finished draft.
   * That is safe because `save_workout` replaces the workout's sets rather than appending
   * to them. The badge that distinguishes "waiting" from "failed" is T3.9c's work; this is
   * only here so that a failed save is not a dead end.
   */
  function retrySave(): void {
    const finished = useWorkoutStore.getState().draft;

    if (!finished) {
      return;
    }

    save.mutate({ kind: 'save-workout', payload: toSaveWorkoutPayload(finished) });
  }

  if (!hydrated) {
    return <PageSkeleton label="Cargando el entrenamiento" />;
  }

  if (!draft || draft.status === 'finished') {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
        <h1 className="text-2xl font-semibold">Entrenar</h1>

        {draft?.status === 'finished' ? (
          <div className="mt-4 space-y-3">
            {save.status === 'error' ? (
              <>
                {/* Said out loud: the session is still on the device, and a screen that
                    stayed quiet would look like the workout had been lost. */}
                <p role="alert" className="text-danger text-sm">
                  No pudimos guardar el entrenamiento. Sigue en el teléfono.
                </p>
                <button
                  type="button"
                  onClick={retrySave}
                  className="ring-white/15 hover:bg-bg min-h-12 w-full rounded-md px-4 ring-1"
                >
                  Reintentar
                </button>
              </>
            ) : (
              <p className="text-muted text-sm">
                Guardando el entrenamiento. Si no hay conexión, se sincroniza solo cuando vuelva.
              </p>
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={start}
          className="bg-primary mt-6 min-h-12 w-full rounded-md px-4 font-medium text-white"
        >
          Nuevo workout
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <h1 className="text-2xl font-semibold">Entrenar</h1>

      <div className="mt-4">
        <Input
          label="Título"
          value={draft.title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Empuje, Pierna…"
          autoComplete="off"
        />
      </div>

      {draft.exercises.length === 0 ? (
        <p className="text-muted mt-6 text-sm">Todavía no agregaste ejercicios.</p>
      ) : (
        <ul aria-label="Ejercicios del entrenamiento" className="mt-6 space-y-3">
          {draft.exercises.map((card) => (
            <li key={card.id}>
              <WorkoutExerciseCard
                name={names.get(card.exerciseId) ?? 'Ejercicio'}
                card={card}
                onAddSet={(seed) => addSet(card.id, seed)}
                onUpdateSet={(setId, patch) => updateSet(card.id, setId, patch)}
                onRemoveSet={(setId) => removeSet(card.id, setId)}
                onRemoveExercise={() => removeExercise(card.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="ring-white/15 hover:bg-bg min-h-12 flex-1 rounded-md px-4 ring-1"
        >
          Agregar ejercicio
        </button>
        <button
          type="button"
          onClick={rest.start}
          className="ring-white/15 hover:bg-bg min-h-12 rounded-md px-4 ring-1"
        >
          Descanso
        </button>
      </div>

      {rest.isRunning ? (
        <p role="status" className="mt-4 text-sm">
          Descanso: {formatRemaining(rest.remainingMs)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={save.finishAndQueue}
        disabled={save.status === 'pending'}
        className="bg-primary mt-6 min-h-12 w-full rounded-md px-4 font-medium text-white disabled:opacity-50"
      >
        Finalizar
      </button>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        userId={user?.id ?? ''}
        onSelect={(exercise) => addExercise(exercise.id)}
        onCreateCustom={(name, muscleGroupId) => addCustomExercise(name, muscleGroupId)}
        localExercises={localExercises}
      />
    </div>
  );
}

/**
 * Minutes and seconds, rounded up so the last second is never shown as zero while the
 * user is still resting.
 */
function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

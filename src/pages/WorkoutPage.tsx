import { Suspense, lazy, useMemo, useState } from 'react';

import { ExercisePickerDialog } from '../components/workout/ExercisePickerDialog.tsx';
import { PersonalRecords } from '../components/workout/PersonalRecords.tsx';
import { Input } from '../components/ui/Input.tsx';
import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { useRestTimer } from '../hooks/useRestTimer.ts';
import { useSaveSync } from '../hooks/useSaveSync.ts';
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

/**
 * The exercise list, with its two gestures, loaded on demand.
 *
 * dnd-kit and Motion are the heaviest dependencies this route touches and the list is the only
 * thing that needs them, so they sit behind one `import()` and travel in their own chunk. That is
 * what the plan's code-splitting table asks for, and it is why the list and not the card owns the
 * gestures: a card that imported them would put both back in the chunk the first card costs.
 */
const SortableExerciseList = lazy(async () => {
  const { SortableExerciseList: List } =
    await import('../components/workout/SortableExerciseList.tsx');

  return { default: List };
});

export function WorkoutPage() {
  const { user } = useAuth();

  const hydrated = useWorkoutStore((state) => state.hydrated);
  const draft = useWorkoutStore((state) => state.draft);
  const start = useWorkoutStore((state) => state.start);
  const setTitle = useWorkoutStore((state) => state.setTitle);
  const addExercise = useWorkoutStore((state) => state.addExercise);
  const addCustomExercise = useWorkoutStore((state) => state.addCustomExercise);
  const removeExercise = useWorkoutStore((state) => state.removeExercise);
  const reorderExercises = useWorkoutStore((state) => state.reorderExercises);
  const addSet = useWorkoutStore((state) => state.addSet);
  const updateSet = useWorkoutStore((state) => state.updateSet);
  const removeSet = useWorkoutStore((state) => state.removeSet);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [dismissedSave, setDismissedSave] = useState<string | null>(null);

  const catalog = useCatalog(user?.id ?? '');
  const rest = useRestTimer(REST_SECONDS);
  const save = useSaveWorkout();

  const customs = draft?.customExercises;
  const isOpen = draft?.status === 'draft';

  /*
   * How many writes are queued and not yet on the server.
   *
   * Read from the queue and not from `save.status`, which is a fact about this hook instance:
   * a write resumed after a reload lands with no hook mounted to hear it, and the screen would
   * sit on "guardando" forever over a workout that was saved minutes ago.
   */
  const waiting = useSaveSync();

  /**
   * The records of the save that landed, and only while they have not been dismissed.
   *
   * Keyed to the workout the server reported and not to the draft, because a successful write
   * clears the draft (`installSaveSync`) and the news would be cleared along with it. The
   * dismissal is remembered per saved workout, so a celebration the user has already read does
   * not come back the next time this screen renders.
   */
  const savedWorkoutId = save.data?.workout_id ?? null;
  const records =
    savedWorkoutId && savedWorkoutId !== dismissedSave ? (save.data?.new_prs ?? []) : [];

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
   * to them.
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

        {records.length > 0 ? (
          <PersonalRecords
            records={records}
            names={names}
            onDismiss={() => setDismissedSave(savedWorkoutId)}
          />
        ) : null}

        {/*
          "Waiting" and "failed" are told apart by the queue, and that is the whole reason
          D2 existed: a paused write and a write whose retries ran out both used to look like
          a finished draft. A finished draft with nothing queued can only mean it never
          landed, because `installSaveSync` clears the draft the moment a write succeeds.
        */}
        {waiting > 0 ? (
          <p className="text-muted mt-4 text-sm">
            Guardando el entrenamiento. Si no hay conexión, se sincroniza solo cuando vuelva.
          </p>
        ) : draft?.status === 'finished' ? (
          <>
            {/* Said out loud: the session is still on the device, and a screen that stayed
                quiet would look like the workout had been lost. */}
            <p role="alert" className="text-danger mt-4 text-sm">
              No pudimos guardar el entrenamiento. Sigue en el teléfono.
            </p>
            <button
              type="button"
              onClick={retrySave}
              className="ring-white/15 hover:bg-bg mt-3 min-h-12 w-full rounded-md px-4 ring-1"
            >
              Reintentar
            </button>
          </>
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
        <Suspense fallback={<ExerciseListSkeleton />}>
          <SortableExerciseList
            cards={draft.exercises}
            names={names}
            /*
             * The store's own actions, passed straight through: their signatures are already the
             * ones the list calls, and a wrapper would only be somewhere for them to drift.
             */
            onReorder={reorderExercises}
            onAddSet={addSet}
            onUpdateSet={updateSet}
            onRemoveSet={removeSet}
            onRemoveExercise={removeExercise}
          />
        </Suspense>
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
 * Blocks and not a spinner, like every other wait in the app. The list arrives as one piece and
 * takes about as long as two cards do, so that is what the placeholder shows.
 */
function ExerciseListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando los ejercicios del entrenamiento"
      className="mt-6 space-y-3"
    >
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
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

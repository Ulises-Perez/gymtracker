import { Suspense, lazy, useMemo, useState } from 'react';

import { ExercisePickerDialog } from '../components/workout/ExercisePickerDialog.tsx';
import { PersonalRecords } from '../components/workout/PersonalRecords.tsx';
import { Input } from '../components/ui/Input.tsx';
import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { useDraftReplacement } from '../hooks/useDraftReplacement.ts';
import { useRestTimer } from '../hooks/useRestTimer.ts';
import { useSaveSync } from '../hooks/useSaveSync.ts';
import { useSaveWorkout } from '../hooks/useSaveWorkout.ts';
import { useWakeLock } from '../hooks/useWakeLock.ts';
import type { CatalogExercise } from '../lib/catalog-api.ts';
import { formatLongDate } from '../lib/utils.ts';
import { toSaveWorkoutPayload } from '../lib/workout-payload.ts';
import { findWorkoutNumberProblem, useWorkoutStore } from '../stores/workout-store.ts';
import type { WorkoutNumberProblem } from '../stores/workout-store.ts';

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
  const setTarget = useWorkoutStore((state) => state.setTarget);
  const reorderExercises = useWorkoutStore((state) => state.reorderExercises);
  const addSet = useWorkoutStore((state) => state.addSet);
  const updateSet = useWorkoutStore((state) => state.updateSet);
  const removeSet = useWorkoutStore((state) => state.removeSet);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [dismissedSave, setDismissedSave] = useState<string | null>(null);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  /*
   * Whether finishing was asked for and refused. Derived from the draft and not from the problem
   * itself: correcting the field is what clears it, so a copy in state would have to be cleared by
   * hand and would be one keystroke behind the truth.
   */
  const [refusedFinish, setRefusedFinish] = useState(false);

  const catalog = useCatalog(user?.id ?? '');
  const rest = useRestTimer(REST_SECONDS);
  const save = useSaveWorkout();

  const customs = draft?.customExercises;
  const isOpen = draft?.status === 'draft';

  /**
   * The first number in the draft the save contract would refuse, if there is one.
   *
   * Recomputed from the draft rather than kept: the card refuses these as they are typed, so only a
   * draft this build did not write — a session restored from an older one — can carry one, and what
   * makes it disappear is the correction itself.
   */
  const numberProblem = useMemo(() => (draft ? findWorkoutNumberProblem(draft) : null), [draft]);

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

  /**
   * "Finalizar", or the reason it did not happen.
   *
   * The gate is here, in front of `finishAndQueue`, because finishing is what makes the draft
   * uneditable: a session whose payload the contract refuses has to stay a draft the person can
   * correct, and the reason has to name the field. The store refuses to freeze such a draft too — the
   * invariant underneath — so the payload of a session the schema would reject cannot be built even
   * by a caller that forgets to ask.
   */
  function finishOrExplain(): void {
    if (numberProblem) {
      setRefusedFinish(true);

      return;
    }

    setRefusedFinish(false);
    save.finishAndQueue();
  }

  /**
   * Opens a fresh workout, having first put the question back down.
   *
   * The flag is cleared here and not left for the next render: after the draft is replaced the
   * screen shows the editor, and a confirmation that survived that transition would reappear
   * pre-opened the next time a finished draft came back.
   */
  function startNew(): void {
    setConfirmingRestart(false);
    // The refusal belonged to the draft that was just replaced; a new one is not refused yet.
    setRefusedFinish(false);
    start();
  }

  /*
   * Whether replacing the stored draft would lose it. The rule lives in `useDraftReplacement`
   * because two screens need it; here it only decides whether "Nuevo workout" has to ask first.
   */
  const replacingIsLossy = useDraftReplacement();

  if (!hydrated) {
    return <PageSkeleton label="Cargando el entrenamiento" />;
  }

  if (!draft || draft.status === 'finished') {
    return (
      <div
        /*
         * A landmark with a stable name, and the reason it is not the heading: the heading of this
         * page is the date, which changes daily. Orientation for a screen reader and a hook for the
         * route test both need a name that does not move.
         */
        role="region"
        aria-label="Entrenar"
        className="mx-auto w-full max-w-lg px-4 pt-6 pb-28"
      >
        {/* The date is the header: the page of a notebook opens with the day it belongs to, and the
            craft floor asks for no label above or below a heading, without exception. */}
        <h1 className="font-display text-3xl font-black tracking-tight">{formatLongDate()}</h1>

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
              className="border-rule hover:bg-surface mt-3 min-h-12 w-full rounded-sm border px-4"
            >
              Reintentar
            </button>
          </>
        ) : null}

        {/*
          Gated on `replacingIsLossy` as well, not only on the flag: if a queued retry lands while
          the question is open, the workout is safe and the confirmation — which says it would be
          lost — is no longer true.
        */}
        {confirmingRestart && replacingIsLossy ? (
          <div className="mt-6 space-y-2">
            {/*
              The truth, said plainly: retries ran out, the queue is empty, and this draft is the
              only copy of the session. The same two-step confirmation the history screen uses for
              a delete, because a workout that is thrown away here cannot be brought back.
            */}
            <p role="alert" className="text-sm">
              ¿Empezar un entrenamiento nuevo? Este no se guardó y se va a perder.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={startNew}
                className="bg-primary min-h-12 flex-1 rounded-sm px-4 font-medium text-white"
              >
                Sí, descartarlo
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRestart(false)}
                className="border-rule hover:bg-surface min-h-12 flex-1 rounded-sm border px-4"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={replacingIsLossy ? () => setConfirmingRestart(true) : startNew}
            className="bg-primary mt-6 min-h-12 w-full rounded-sm px-4 font-medium text-white"
          >
            Nuevo workout
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="region" aria-label="Entrenar" className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      {/* The same date header, because it is the same page of the notebook whether or not a set has
          already been written on it. */}
      <h1 className="font-display text-3xl font-black tracking-tight">{formatLongDate()}</h1>

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
            onSetTarget={setTarget}
          />
        </Suspense>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="border-rule hover:bg-surface min-h-12 flex-1 rounded-sm border px-4"
        >
          Agregar ejercicio
        </button>
        <button
          type="button"
          onClick={rest.start}
          className="border-rule hover:bg-surface min-h-12 rounded-sm border px-4"
        >
          Descanso
        </button>
      </div>

      {rest.isRunning ? (
        <p role="status" className="mt-4 text-sm">
          Descanso: {formatRemaining(rest.remainingMs)}
        </p>
      ) : null}

      {/*
        The reason, and the field it is about: the card names its own errors next to the field that
        was typed into, but this one belongs to a draft that arrived from somewhere else, so the
        sentence has to carry the card and the row to the person.
      */}
      {refusedFinish && numberProblem ? (
        <p role="alert" className="text-danger mt-4 text-sm">
          No se puede finalizar: {describeNumberProblem(numberProblem, names)}.
        </p>
      ) : null}

      <button
        type="button"
        onClick={finishOrExplain}
        disabled={save.status === 'pending'}
        className="bg-primary mt-6 min-h-12 w-full rounded-sm px-4 font-medium text-white disabled:opacity-50"
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
 * "«Press Banca», serie 1. Las reps tienen que ser un número entero mayor que cero."
 *
 * The card by the name the picker gave it and the row the way the row is written on it — the target's
 * row has no number, so it is called what the card calls it. The rule's own words come last, so the
 * sentence leads with where to look and ends with what to fix.
 */
function describeNumberProblem(problem: WorkoutNumberProblem, names: Map<string, string>): string {
  const card = names.get(problem.exerciseId) ?? 'este ejercicio';
  const row = problem.setNumber === null ? 'objetivo' : `serie ${problem.setNumber}`;

  return `«${card}», ${row}. ${problem.refusal}`;
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

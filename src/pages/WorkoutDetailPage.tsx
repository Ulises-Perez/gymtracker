import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { useDraftReplacement } from '../hooks/useDraftReplacement.ts';
import { useWeightUnit } from '../hooks/useProfile.ts';
import { useWorkoutDetail } from '../hooks/useWorkoutDetail.ts';
import type { WorkoutExerciseDetail, WorkoutSetDetail } from '../lib/history-api.ts';
import { softDeleteWorkout } from '../lib/history-api.ts';
import { markStaleAfterDelete } from '../lib/stale-after-write.ts';
import { formatWeight } from '../lib/units.ts';
import type { WeightUnit } from '../lib/units.ts';
import { formatIsoDate } from '../lib/utils.ts';
import { useWorkoutStore } from '../stores/workout-store.ts';

/**
 * One workout, as it was recorded.
 *
 * The sets are grouped by **card** — the exercise inside this session — and the cards come out in the
 * order they were stored. Grouping by exercise was the old shape and could not tell two cards of the
 * same exercise apart: with the same exercise twice, every set landed in one block and the order the
 * session really had was lost. The names still come from the catalogue the screen already has
 * cached.
 */
export function WorkoutDetailPage() {
  const { workoutId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [confirmingRepeat, setConfirmingRepeat] = useState(false);
  const hydrated = useWorkoutStore((state) => state.hydrated);
  const repeatFrom = useWorkoutStore((state) => state.repeatFrom);
  const detail = useWorkoutDetail(workoutId);
  const catalog = useCatalog(user?.id ?? '');
  // This screen's subject is reading, so it speaks the unit the user prefers. The stored kilos are
  // converted at the line below and nowhere else.
  const unit = useWeightUnit(user?.id ?? '');

  /*
   * Whether replacing the stored draft would lose the only copy of a session. Shared with the
   * workout screen so the rule cannot be written twice and drift.
   */
  const replacingIsLossy = useDraftReplacement();

  const remove = useMutation({
    mutationFn: () => softDeleteWorkout(workoutId),
    onSuccess: async () => {
      /*
       * The cached list still holds a workout that is now gone from the server. Invalidating before
       * navigating back is what makes the screen the user lands on agree with what they just did;
       * navigating first would show the row for as long as the refetch takes.
       */
      await queryClient.invalidateQueries({ queryKey: ['history'] });
      /*
       * And the other reads that saw the workout: the summary of the account is cached, so the
       * Inicio kept showing a streak and a last workout that were already deleted.
       */
      markStaleAfterDelete(queryClient);
      void navigate('/history', { replace: true });
    },
  });

  const names = useMemo(
    () => new Map((catalog.data?.exercises ?? []).map((exercise) => [exercise.id, exercise.name])),
    [catalog.data],
  );

  const groups = useMemo(
    () => groupByCard(detail.data?.exercises ?? [], detail.data?.sets ?? []),
    [detail.data],
  );

  /**
   * Opens a new session from this one, ready to be trained.
   *
   * The notes are not carried over, only the title: the title names the session being repeated,
   * while the notes are a comment about the day this one happened.
   */
  function repeatNow(): void {
    if (!detail.data) {
      return;
    }

    setConfirmingRepeat(false);
    repeatFrom({
      title: detail.data.workout.title,
      exercises: detail.data.exercises,
    });
    void navigate('/workout');
  }

  /**
   * Asks first when replacing the draft would lose the only copy of a session.
   *
   * The rule is `useDraftReplacement`, shared with the workout screen: an open draft, or a finished
   * one whose retries ran out. A finished draft already in the queue is not the only copy, so that
   * tap stays a tap. This is the same two-step confirmation the workout screen uses, and cancelling
   * it has to change nothing.
   */
  function startRepeat(): void {
    if (replacingIsLossy) {
      setConfirmingRepeat(true);
      return;
    }

    repeatNow();
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <Link to="/history" className="text-text link-ruled text-sm">
        ← Historial
      </Link>

      <h1 className="font-display mt-2 text-3xl font-black tracking-tight">
        {detail.data ? formatIsoDate(detail.data.workout.date) : 'Entrenamiento'}
      </h1>

      {detail.data?.workout.title ? (
        <p className="text-muted mt-1 text-sm">{detail.data.workout.title}</p>
      ) : null}

      {detail.data?.workout.durationMinutes !== null && detail.data !== undefined ? (
        <p className="text-muted tabular mt-1 text-sm">{detail.data.workout.durationMinutes} min</p>
      ) : null}

      {detail.isPending ? <PageSkeleton label="Cargando el entrenamiento" /> : null}

      {detail.isError ? (
        <p role="alert" className="text-danger mt-4 text-sm">
          No pudimos cargar este entrenamiento. Puede que se haya borrado.
        </p>
      ) : null}

      {groups.map(({ card, sets }) => (
        /*
         * A ruled block and not a card: the group opens with a printed rule and its sets are rows
         * under it, so nothing is nested inside anything and the elevation is the border alone. The
         * rule is ink and doubled because it starts an exercise, exactly like the block on the
         * workout screen.
         */
        <section key={card.id} className="border-text mt-6 border-t-2 pt-4">
          <h2 className="font-display text-lg font-extrabold tracking-tight uppercase">
            {/* The way into the exercise's own screen, where its progress is graphed. It navigates
                and does nothing else, so it stays ink and the printed rule underlines it. That rule
                is `link-ruled` (see `src/index.css`) and not the pale separator rule it used to be:
                this name is the only route to the chart, and at 1.30:1 the underline did not say so. */}
            <Link to={`/history/exercise/${card.exerciseId}`} className="link-ruled">
              {names.get(card.exerciseId) ?? 'Ejercicio'}
            </Link>
          </h2>

          <ul
            aria-label={`Series de ${names.get(card.exerciseId) ?? 'ejercicio'}`}
            className="mt-2"
          >
            {sets.map((set) => (
              <li key={set.id} className="border-rule tabular text-muted border-b py-1 text-sm">
                {set.setNumber}ª · {formatSet(set, unit)}
                {set.isWarmup ? ' · calentamiento' : ''}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {detail.isSuccess ? (
        <div className="mt-8 space-y-6">
          <div>
            {confirmingRepeat && replacingIsLossy ? (
              <div className="space-y-2">
                {/*
                 * The truth, said plainly: the draft is the only copy of the session and it cannot
                 * be brought back. The same question and the same two answers as the workout screen.
                 */}
                <p role="alert" className="text-sm">
                  ¿Empezar un entrenamiento nuevo? Este no se guardó y se va a perder.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={repeatNow}
                    className="bg-primary min-h-12 flex-1 rounded-sm px-4 font-medium text-white"
                  >
                    Sí, descartarlo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRepeat(false)}
                    className="border-rule hover:bg-surface min-h-12 flex-1 rounded-sm border px-4"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              /*
               * The way to train this session again. A plain primary action and not a destructive
               * one: it creates a workout, it does not remove anything. It stays out of reach until
               * the stored draft has been read, because before that the screen cannot tell "no
               * draft" from "not read yet".
               */
              <button
                type="button"
                onClick={startRepeat}
                disabled={!hydrated}
                className="bg-primary min-h-12 w-full rounded-sm px-4 font-medium text-white disabled:opacity-50"
              >
                Repetir este entrenamiento
              </button>
            )}
          </div>

          <div>
            {confirming ? (
              <div className="space-y-2">
                {/*
                 * The truth about a soft delete, said out loud: the workout stops appearing, and the
                 * sets it produced stay. Promising that it is recoverable would be a promise the app
                 * cannot keep — there is no screen that brings it back.
                 */}
                <p role="alert" className="text-sm">
                  ¿Borrar este entrenamiento? Va a dejar de aparecer, pero sus series quedan
                  guardadas.
                </p>

                <div className="flex gap-2">
                  {/*
                   * The confirm step of a destructive action is one of the two places the red fill
                   * belongs: this is the tap that commits. `danger` carries the same value and is a
                   * different meaning, so the accent is used here and the error colour is left to
                   * errors.
                   */}
                  <button
                    type="button"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                    className="bg-primary min-h-12 flex-1 rounded-sm px-4 font-medium text-white disabled:opacity-50"
                  >
                    Sí, borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="border-rule hover:bg-surface min-h-12 flex-1 rounded-sm border px-4"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              /*
               * The destructive action that asks first: a ruled button whose words carry the warning.
               * The printed ring of the old world is gone -- on paper it was an invisible border -- and
               * so is the ring behind the error text.
               */
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="border-rule text-danger hover:bg-surface min-h-12 w-full rounded-sm border px-4"
              >
                Borrar este entrenamiento
              </button>
            )}

            {remove.isError ? (
              <p role="alert" className="text-danger mt-2 text-sm">
                No pudimos borrarlo. Probá de nuevo.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CardGroup = {
  card: WorkoutExerciseDetail;
  sets: WorkoutSetDetail[];
};

/**
 * The session's cards, in their stored order, each with the sets recorded in it.
 *
 * The sort is explicit even though the query already asks for `position` order: what the screen
 * shows is the stored order, so the function that decides it should not depend on how the rows
 * happened to arrive. A set is placed by its card id and never by its exercise, which is what keeps
 * two cards of the same exercise from being merged into one block.
 */
function groupByCard(exercises: WorkoutExerciseDetail[], sets: WorkoutSetDetail[]): CardGroup[] {
  return [...exercises]
    .sort((left, right) => left.position - right.position)
    .map((card) => ({
      card,
      sets: sets.filter((set) => set.workoutExerciseId === card.id),
    }));
}

/**
 * "5 × 100 kg", and whatever is known when the set was left half written.
 *
 * A missing weight says so instead of printing zero: this is a record of what happened, and "0 kg" is
 * a claim nobody made. The weight is stored in kilos and shown in the preferred unit, which is the
 * one conversion this reading screen makes.
 */
function formatSet(set: WorkoutSetDetail, unit: WeightUnit): string {
  const reps = set.reps === null ? '—' : String(set.reps);
  const weight = set.weightKg === null ? '—' : formatWeight(set.weightKg, unit);

  return `${reps} × ${weight}`;
}

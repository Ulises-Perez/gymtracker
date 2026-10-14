import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { useWorkoutDetail } from '../hooks/useWorkoutDetail.ts';
import type { WorkoutSetDetail } from '../lib/history-api.ts';
import { softDeleteWorkout } from '../lib/history-api.ts';
import { formatIsoDate } from '../lib/utils.ts';

/**
 * One workout, as it was recorded.
 *
 * The sets are grouped by exercise because that is how they were entered, and the names come from the
 * catalogue the screen already has cached. The database does not store the order the cards were in —
 * only each set's number inside its own exercise — so the groups come out in the order the sets were
 * numbered, which is stable without pretending to be the session's original order.
 */
export function WorkoutDetailPage() {
  const { workoutId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const detail = useWorkoutDetail(workoutId);
  const catalog = useCatalog(user?.id ?? '');

  const remove = useMutation({
    mutationFn: () => softDeleteWorkout(workoutId),
    onSuccess: async () => {
      /*
       * The cached list still holds a workout that is now gone from the server. Invalidating before
       * navigating back is what makes the screen the user lands on agree with what they just did;
       * navigating first would show the row for as long as the refetch takes.
       */
      await queryClient.invalidateQueries({ queryKey: ['history'] });
      void navigate('/history', { replace: true });
    },
  });

  const names = useMemo(
    () => new Map((catalog.data?.exercises ?? []).map((exercise) => [exercise.id, exercise.name])),
    [catalog.data],
  );

  const groups = useMemo(() => groupByExercise(detail.data?.sets ?? []), [detail.data]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <Link to="/history" className="text-muted hover:text-text text-sm">
        ← Historial
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">
        {detail.data ? formatIsoDate(detail.data.workout.date) : 'Entrenamiento'}
      </h1>

      {detail.data?.workout.title ? (
        <p className="text-muted mt-1 text-sm">{detail.data.workout.title}</p>
      ) : null}

      {detail.data?.workout.durationMinutes !== null && detail.data !== undefined ? (
        <p className="text-muted mt-1 text-sm">{detail.data.workout.durationMinutes} min</p>
      ) : null}

      {detail.isPending ? <PageSkeleton label="Cargando el entrenamiento" /> : null}

      {detail.isError ? (
        <p role="alert" className="text-danger mt-4 text-sm">
          No pudimos cargar este entrenamiento. Puede que se haya borrado.
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.exerciseId} className="bg-surface mt-4 rounded-lg p-4">
          <h2 className="text-base font-semibold">
            {/* The way into the exercise's own screen, where its progress is graphed. */}
            <Link to={`/history/exercise/${group.exerciseId}`} className="hover:text-primary-soft">
              {names.get(group.exerciseId) ?? 'Ejercicio'}
            </Link>
          </h2>

          <ul
            aria-label={`Series de ${names.get(group.exerciseId) ?? 'ejercicio'}`}
            className="mt-2 space-y-1"
          >
            {group.sets.map((set) => (
              <li key={set.id} className="text-muted text-sm">
                {set.setNumber}ª · {formatSet(set)}
                {set.isWarmup ? ' · calentamiento' : ''}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {detail.isSuccess ? (
        <div className="mt-8">
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
                <button
                  type="button"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                  className="bg-danger min-h-12 flex-1 rounded-md px-4 font-medium text-white disabled:opacity-50"
                >
                  Sí, borrar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="ring-white/15 hover:bg-bg min-h-12 flex-1 rounded-md px-4 ring-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ring-danger/40 text-danger hover:bg-danger/10 min-h-12 w-full rounded-md px-4 ring-1"
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
      ) : null}
    </div>
  );
}

type ExerciseGroup = {
  exerciseId: string;
  sets: WorkoutSetDetail[];
};

function groupByExercise(sets: WorkoutSetDetail[]): ExerciseGroup[] {
  const groups = new Map<string, WorkoutSetDetail[]>();

  for (const set of sets) {
    groups.set(set.exerciseId, [...(groups.get(set.exerciseId) ?? []), set]);
  }

  return [...groups.entries()].map(([exerciseId, groupSets]) => ({
    exerciseId,
    sets: groupSets,
  }));
}

/**
 * "5 × 100 kg", and whatever is known when the set was left half written.
 *
 * A missing weight says so instead of printing zero: this is a record of what happened, and "0 kg" is
 * a claim nobody made.
 */
function formatSet(set: WorkoutSetDetail): string {
  const reps = set.reps === null ? '—' : String(set.reps);
  const weight = set.weightKg === null ? '—' : `${set.weightKg} kg`;

  return `${reps} × ${weight}`;
}

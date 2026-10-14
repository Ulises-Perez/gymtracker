import { Link } from 'react-router';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useWorkoutHistory } from '../hooks/useWorkoutHistory.ts';
import { formatIsoDate } from '../lib/utils.ts';

/**
 * The history: the workouts that reached the server, newest first.
 *
 * Only what is already saved. A workout still sitting in the queue is not here — it is on the
 * workout screen, where the badge says it is waiting — and showing it in both places would be two
 * sources of truth for the same session.
 *
 * The heading renders in every state, including the empty one: a screen that loses its title while
 * it loads or fails looks like a different screen.
 */
export function HistoryPage() {
  const { user } = useAuth();
  const history = useWorkoutHistory(user?.id ?? '');
  const workouts = history.data?.pages.flatMap((page) => page.workouts) ?? [];

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <h1 className="text-2xl font-semibold">Historial</h1>

      {history.isPending ? <PageSkeleton label="Cargando el historial" /> : null}

      {history.isError ? (
        // An empty list and a denied query look identical on screen, so the failure says so.
        <p role="alert" className="text-danger mt-4 text-sm">
          No pudimos cargar el historial. Revisá tu conexión e intentá de nuevo.
        </p>
      ) : null}

      {history.isSuccess && workouts.length === 0 ? (
        <p className="text-muted mt-4 text-sm">Todavía no registraste ningún entrenamiento.</p>
      ) : null}

      {workouts.length > 0 ? (
        <>
          <ul aria-label="Entrenamientos" className="mt-4 space-y-2">
            {workouts.map((workout) => (
              <li key={workout.id}>
                <Link
                  to={`/history/${workout.id}`}
                  className="bg-surface hover:bg-bg block rounded-lg p-4"
                >
                  <p className="text-sm font-medium">{formatIsoDate(workout.date)}</p>
                  <p className="text-muted mt-0.5 text-sm">
                    {workout.title ?? 'Entrenamiento'}
                    {workout.durationMinutes !== null ? ` · ${workout.durationMinutes} min` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {history.hasNextPage ? (
            <button
              type="button"
              onClick={() => void history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
              className="ring-white/15 hover:bg-bg mt-3 min-h-12 w-full rounded-md px-4 ring-1 disabled:opacity-50"
            >
              {history.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

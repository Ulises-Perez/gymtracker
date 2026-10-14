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
      {/* The display face at its own weight: in this world a page title is printed, not the interface
          face pushed heavier. */}
      <h1 className="font-display text-3xl font-black tracking-tight">Historial</h1>

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
          {/*
           * Ruled rows, not cards: the history is a page of the notebook, so every workout is a line
           * under the one before it. One elevation and it is the rule -- no card, no shadow, nothing
           * nested inside anything.
           */}
          <ul aria-label="Entrenamientos" className="border-rule mt-4 border-t">
            {workouts.map((workout) => (
              <li key={workout.id} className="border-rule border-b">
                <Link to={`/history/${workout.id}`} className="hover:bg-surface block px-1 py-3">
                  {/* Tabular figures so the dates form a column instead of shifting row by row. */}
                  <p className="tabular text-sm font-medium">{formatIsoDate(workout.date)}</p>
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
              /*
               * Paging only brings more of the list, so it neither advances the session nor
               * replaces anything: a ruled button, and the accent stays where it means something.
               * Its focus ring comes from `index.css`, which declares focus once for the whole app.
               */
              className="border-rule hover:bg-surface mt-3 min-h-12 w-full rounded-sm border px-4 disabled:opacity-50"
            >
              {history.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

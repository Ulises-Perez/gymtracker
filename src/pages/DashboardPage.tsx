import { Link } from 'react-router';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useDashboard } from '../hooks/useDashboard.ts';
import { formatIsoDate, localIsoDate } from '../lib/utils.ts';

/**
 * Inicio: the whole dashboard from one call.
 *
 * Everything here comes from `dashboard_summary()` — the streak, the week, the records and the last
 * workout — so the screen makes no decisions about the data and does no arithmetic on it. The two
 * things it does compute are the greeting and which of this week's seven days to light up, and both
 * are about the current clock rather than about the workout: the database has no business knowing
 * what time it is where the user is.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useDashboard(user?.id ?? '');
  const summary = dashboard.data;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      {/*
       * The greeting is a line under the title and not the title itself. The screen is called Inicio
       * — that is what the nav says and what identifies it — and a title that changes with the clock
       * is a title no test can look for and no one can navigate by.
       */}
      <p className="text-muted mt-1 text-sm">{greeting(new Date())}</p>

      {dashboard.isPending ? <PageSkeleton label="Cargando el inicio" /> : null}

      {dashboard.isError ? (
        <p role="alert" className="text-danger mt-4 text-sm">
          No pudimos cargar el inicio. Revisá tu conexión e intentá de nuevo.
        </p>
      ) : null}

      {summary ? (
        <>
          <p className="text-muted mt-4 text-sm">{streakSentence(summary.streak)}</p>

          <WeekStrip weekDays={summary.week_days} />

          {summary.last_workout ? (
            <section aria-labelledby="ultimo" className="bg-surface mt-4 rounded-lg p-4">
              <h2 id="ultimo" className="text-base font-semibold">
                Último entrenamiento
              </h2>
              <Link
                to={`/history/${summary.last_workout.id}`}
                className="hover:text-primary-soft mt-1 block text-sm"
              >
                {formatIsoDate(summary.last_workout.date)}
                {summary.last_workout.title ? ` · ${summary.last_workout.title}` : ''}
                {summary.last_workout.duration_minutes !== null
                  ? ` · ${summary.last_workout.duration_minutes} min`
                  : ''}
              </Link>
              <p className="text-muted mt-1 text-sm">
                {summary.last_workout.exercise_count} ejercicios
              </p>
            </section>
          ) : (
            <p className="text-muted mt-4 text-sm">
              Todavía no registraste ningún entrenamiento. Cuando guardes el primero, acá vas a ver
              tu racha y tus récords.
            </p>
          )}

          {summary.recent_prs.length > 0 ? (
            <section aria-labelledby="records" className="mt-4">
              <h2 id="records" className="text-base font-semibold">
                Récords recientes
              </h2>
              <ul className="mt-2 space-y-2">
                {summary.recent_prs.map((pr) => (
                  <li
                    key={`${pr.exercise_id}-${pr.achieved_at}`}
                    className="bg-surface rounded-lg p-3"
                  >
                    <span className="text-sm font-medium">{pr.exercise_name}</span>
                    <span className="text-muted block text-sm">
                      {pr.max_weight_kg ?? '—'} kg · {pr.max_reps ?? '—'} reps ·{' '}
                      {formatIsoDate(pr.achieved_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {/* The one action this screen exists to offer, within reach of a thumb. */}
      <Link
        to="/workout"
        className="bg-primary fixed right-4 bottom-20 z-30 flex min-h-14 items-center rounded-full px-5 font-medium text-white"
      >
        + Nuevo workout
      </Link>
    </div>
  );
}

/**
 * The seven days of the current week, Monday first.
 *
 * Built by stepping a local `Date` and formatting each step with the same local helper the app uses
 * everywhere, so the comparison against the days the database sent is between two `YYYY-MM-DD`
 * strings. Nothing here goes through UTC, which is what keeps the strip from highlighting the wrong
 * square for anyone west of Greenwich.
 */
function WeekStrip({ weekDays }: { weekDays: string[] }) {
  const trained = new Set(weekDays);
  const days = currentWeek(new Date());

  return (
    <ul aria-label="Esta semana" className="mt-4 flex gap-1">
      {days.map((day) => {
        const didTrain = trained.has(day);

        return (
          <li
            key={day}
            aria-label={didTrain ? 'entrenado' : 'sin entrenar'}
            className={`h-8 flex-1 rounded-md ${didTrain ? 'bg-primary' : 'bg-surface'}`}
          />
        );
      })}
    </ul>
  );
}

/** Monday-first, as the database's own `date_trunc('week')` counts it. */
function currentWeek(now: Date): string[] {
  const monday = new Date(now);
  // `getDay()` is Sunday-first, which is the off-by-one this is here to undo.
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);

    return localIsoDate(day);
  });
}

function greeting(now: Date): string {
  const hour = now.getHours();

  if (hour < 12) {
    return 'Buenos días';
  }

  return hour < 20 ? 'Buenas tardes' : 'Buenas noches';
}

function streakSentence(streak: number): string {
  if (streak === 0) {
    return 'Sin racha por ahora.';
  }

  return streak === 1 ? 'Racha de 1 día.' : `Racha de ${streak} días.`;
}

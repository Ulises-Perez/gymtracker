import { Link } from 'react-router';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useDashboard } from '../hooks/useDashboard.ts';
import { usePrefetch } from '../hooks/usePrefetch.ts';
import { useWeightUnit } from '../hooks/useProfile.ts';
import { formatWeight } from '../lib/units.ts';
import { formatIsoDate, formatLongDate, localIsoDate } from '../lib/utils.ts';

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
  // The records line is a weight someone reads, so it follows the preference. The streak and the
  // week strip are not weights and do not convert.
  const unit = useWeightUnit(user?.id ?? '');

  // The catalogue and the history, while the user is reading this. See `usePrefetch`.
  usePrefetch(user?.id ?? '', dashboard.isSuccess);

  return (
    <div
      /*
       * A landmark with a stable name, and the reason it is not the heading: the heading of this
       * page is the date, which changes daily. Orientation for a screen reader and a hook for the
       * route test both need a name that does not move.
       */
      role="region"
      aria-label="Inicio"
      className="mx-auto w-full max-w-lg px-4 pt-6 pb-28"
    >
      {/* The date is the header: the same page of the notebook the workout screen opens with, and
          the craft floor asks for no label above or below a heading, without exception. */}
      <h1 className="font-display text-3xl font-black tracking-tight">{formatLongDate()}</h1>
      {/*
       * The greeting is a line under the header and not the header itself. The screen is called
       * Inicio — that is what the nav says and what the landmark names — and a heading that changes
       * with the clock is a heading no test can look for and no one can navigate by.
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
          {/* A figure read as data, so it does not shift while it is being read. */}
          <p className="text-muted tabular mt-4 text-sm">{streakSentence(summary.streak)}</p>

          <WeekStrip weekDays={summary.week_days} />

          {summary.last_workout ? (
            /*
             * A ruled block and not a card: the section opens with a printed rule and its facts are
             * rows under it, so the elevation is the border alone and nothing is nested.
             */
            <section aria-labelledby="ultimo" className="border-text mt-6 border-t-2 pt-4">
              <h2 id="ultimo" className="font-display text-lg font-extrabold tracking-tight">
                Último entrenamiento
              </h2>
              {/* It navigates and does nothing else, so it stays ink with the printed rule
                  underlining it -- the accent belongs to what was replaced and what commits. */}
              <Link
                to={`/history/${summary.last_workout.id}`}
                className="decoration-rule hover:decoration-text tabular mt-1 block text-sm underline"
              >
                {formatIsoDate(summary.last_workout.date)}
                {summary.last_workout.title ? ` · ${summary.last_workout.title}` : ''}
                {summary.last_workout.duration_minutes !== null
                  ? ` · ${summary.last_workout.duration_minutes} min`
                  : ''}
              </Link>
              <p className="text-muted tabular mt-1 text-sm">
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
            <section aria-labelledby="records" className="border-text mt-6 border-t-2 pt-4">
              <h2 id="records" className="font-display text-lg font-extrabold tracking-tight">
                Récords recientes
              </h2>
              {/* Ruled rows, not cards: the records are lines on the page, figures tabular so the
                  column of weights holds still. */}
              <ul className="mt-2">
                {summary.recent_prs.map((pr) => (
                  <li
                    key={`${pr.exercise_id}-${pr.achieved_at}`}
                    className="border-rule border-b py-2"
                  >
                    <span className="text-sm font-medium">{pr.exercise_name}</span>
                    <span className="text-muted tabular block text-sm">
                      {pr.max_weight_kg === null || pr.max_weight_kg === undefined
                        ? '—'
                        : formatWeight(pr.max_weight_kg, unit)}{' '}
                      · {pr.max_reps ?? '—'} reps · {formatIsoDate(pr.achieved_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {/*
       * The one action this screen exists to offer, within reach of a thumb. It advances the
       * session, so the red fill is the accent earning its keep; the corner is a control's, not the
       * pill of a large floating thing.
       */}
      <Link
        to="/workout"
        className="bg-primary fixed right-4 bottom-20 z-30 flex min-h-14 items-center rounded-sm px-5 font-medium text-white"
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
            /*
             * Ink for a day that was trained, an empty ruled box for one that was not. This is a
             * mark on the page, not a press, so the accent stays out of it -- the red means what was
             * replaced and what commits, and having trained is neither.
             */
            className={`h-8 flex-1 border ${didTrain ? 'bg-text border-text' : 'border-rule'}`}
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

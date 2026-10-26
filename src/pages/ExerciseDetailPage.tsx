import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { ArrowLeftIcon } from '../components/icons.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { useWeightUnit } from '../hooks/useProfile.ts';
import { fetchExerciseProgress } from '../lib/progress-api.ts';
import type { ExerciseProgressPoint, ProgressMetric } from '../lib/progress-api.ts';
import { formatWeight } from '../lib/units.ts';
import { formatIsoDate } from '../lib/utils.ts';

/**
 * The chart, on demand.
 *
 * Behind its own `import()` so uPlot and its stylesheet stay out of both the initial bundle and this
 * page's own chunk, which is what the budget requires. The fallback is a skeleton of the same
 * height, so the page does not jump when the canvas arrives.
 */
const ProgressChart = lazy(async () => {
  const { ProgressChart: Chart } = await import('../components/history/ProgressChart.tsx');

  return { default: Chart };
});

const METRICS: { metric: ProgressMetric; label: string }[] = [
  { metric: 'maxWeight', label: 'Peso máximo' },
  { metric: 'volume', label: 'Volumen' },
  { metric: 'oneRm', label: '1RM estimado' },
];

/**
 * One exercise's progress.
 *
 * There is no exercise read: the name comes from the catalogue that is already cached, which is the
 * same list the workout screen resolves it from. One source for a name.
 */
export function ExerciseDetailPage() {
  const { exerciseId = '' } = useParams();
  const { user } = useAuth();
  const [metric, setMetric] = useState<ProgressMetric>('maxWeight');
  const catalog = useCatalog(user?.id ?? '');
  // Reading screen: the chart and the sessions below read in the preferred unit, and the conversion
  // happens in `buildChartSeries` and `formatWeight`, on the way to the screen.
  const unit = useWeightUnit(user?.id ?? '');

  const progress = useQuery({
    // The exercise id is a global catalogue id, so the owner belongs in the key:
    // the persisted cache outlives the session and the second account on this
    // device must not be shown the first account's dated weights.
    queryKey: ['progress', user?.id ?? '', exerciseId],
    queryFn: () => fetchExerciseProgress(exerciseId),
    enabled: (user?.id ?? '') !== '' && exerciseId !== '',
  });

  const name = useMemo(
    () =>
      (catalog.data?.exercises ?? []).find((exercise) => exercise.id === exerciseId)?.name ??
      'Ejercicio',
    [catalog.data, exerciseId],
  );

  const points = progress.data ?? [];

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      {/* A printed rule under the words, from the shared `link-ruled` class in `src/index.css`: the
          pale separator rule under it measured 1.30:1, and a link that faint is not a link. */}
      <Link to="/history" className="text-text link-ruled inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" />
        Historial
      </Link>

      <h1 className="font-display mt-2 text-3xl font-black tracking-tight">{name}</h1>

      {progress.isPending ? <Skeleton className="mt-4 h-6 w-40" /> : null}

      {progress.isError ? (
        <p role="alert" className="text-danger mt-4 text-sm">
          No pudimos cargar el progreso. Revisá tu conexión e intentá de nuevo.
        </p>
      ) : null}

      {progress.isSuccess && points.length === 0 ? (
        <p className="text-muted mt-4 text-sm">
          Todavía no hay series de este ejercicio. Se grafica a partir de la primera que guardes.
        </p>
      ) : null}

      {points.length > 0 ? (
        <>
          <div role="group" aria-label="Qué graficar" className="mt-4 flex flex-wrap gap-2">
            {METRICS.map((entry) => (
              <button
                key={entry.metric}
                type="button"
                // `aria-pressed` rather than a colour alone: the choice has to be audible.
                aria-pressed={metric === entry.metric}
                onClick={() => setMetric(entry.metric)}
                /*
                 * The chosen metric is ink and not accent, the same call the picker's chips made:
                 * the red belongs to what was replaced and to what moves the session forward, and
                 * which line is being plotted is a state. The old world's `ring-white/15` is gone
                 * -- on paper it was an invisible border -- and so are the per-control focus rings,
                 * because focus is declared once, in `index.css`.
                 */
                className={`border-rule min-h-12 rounded-sm border px-3 text-sm transition-colors motion-reduce:transition-none ${
                  metric === entry.metric
                    ? 'bg-text border-text text-bg'
                    : 'text-muted hover:text-text'
                }`}
              >
                {entry.label} ({unit})
              </button>
            ))}
          </div>

          {/*
            The one metric whose name is not the thing it measures. Without a line of help, "1RM
            estimado" asks the person to know a term from a training manual; the formula is the
            whole answer, and it is short enough to sit under the chips.
          */}
          <p className="text-muted mt-2 text-xs">
            El 1RM estimado es cuánto podrías levantar una sola vez, estimado con la fórmula de
            Epley: peso × (1 + reps / 30).
          </p>

          <Suspense fallback={<Skeleton className="mt-3 h-[220px] w-full" />}>
            {/* The label is the unit itself, so the plotted values cannot disagree with it:
                `buildChartSeries` converts the stored kilos to it. The chart draws no legend -- the
                unit reads on the chips above, which is where someone chooses what they look at. */}
            <ProgressChart points={points} metric={metric} label={unit} />
          </Suspense>

          {/* The sessions as ruled rows, with the figures tabular so the column of numbers holds
              still and the date column does not wobble down the page. */}
          <ul aria-label="Sesiones" className="mt-4">
            {points.map((point: ExerciseProgressPoint) => {
              const maxWeight =
                point.maxWeight === null ? '—' : formatWeight(point.maxWeight, unit);
              const volume = point.volume === null ? '—' : formatWeight(point.volume, unit);

              return (
                <li
                  key={point.date}
                  className="border-rule tabular text-muted border-b py-1 text-sm"
                >
                  {formatIsoDate(point.date)} · {maxWeight} máx · {volume} de volumen
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

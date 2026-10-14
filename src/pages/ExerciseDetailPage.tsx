import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useCatalog } from '../hooks/useCatalog.ts';
import { fetchExerciseProgress } from '../lib/progress-api.ts';
import type { ExerciseProgressPoint, ProgressMetric } from '../lib/progress-api.ts';
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

const METRICS: { metric: ProgressMetric; label: string; series: string }[] = [
  { metric: 'maxWeight', label: 'Peso máximo', series: 'kg' },
  { metric: 'volume', label: 'Volumen', series: 'kg' },
  { metric: 'oneRm', label: '1RM estimado', series: 'kg' },
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

  const progress = useQuery({
    queryKey: ['progress', exerciseId],
    queryFn: () => fetchExerciseProgress(exerciseId),
    enabled: exerciseId !== '',
  });

  const name = useMemo(
    () =>
      (catalog.data?.exercises ?? []).find((exercise) => exercise.id === exerciseId)?.name ??
      'Ejercicio',
    [catalog.data, exerciseId],
  );

  const points = progress.data ?? [];
  const chosen = METRICS.find((entry) => entry.metric === metric) ?? METRICS[0];

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <Link to="/history" className="text-muted hover:text-text text-sm">
        ← Historial
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">{name}</h1>

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
                className={`min-h-12 rounded-md px-3 text-sm ring-1 focus-visible:ring-2 focus-visible:outline-none ${
                  metric === entry.metric
                    ? 'bg-primary ring-primary text-white'
                    : 'ring-white/15 hover:bg-bg'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <Suspense fallback={<Skeleton className="mt-3 h-[220px] w-full" />}>
            <ProgressChart points={points} metric={metric} label={chosen?.series ?? ''} />
          </Suspense>

          <ul aria-label="Sesiones" className="text-muted mt-4 space-y-1 text-sm">
            {points.map((point: ExerciseProgressPoint) => (
              <li key={point.date}>
                {formatIsoDate(point.date)} · {point.maxWeight} kg máx · {point.volume} kg de
                volumen
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

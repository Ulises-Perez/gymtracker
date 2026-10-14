import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { buildChartSeries } from '../../lib/progress-api.ts';
import type { ExerciseProgressPoint, ProgressMetric } from '../../lib/progress-api.ts';

/**
 * The progress line, drawn by uPlot.
 *
 * This module exists as its own file so it can be loaded on demand: uPlot is about 50 kB and only
 * this screen needs it, so it travels in a chunk of its own rather than in the one every route pays
 * for. That is the plan's requirement (S11), not a preference.
 *
 * uPlot owns a canvas and draws imperatively, so this is a `useEffect` and not markup: create the
 * plot when the data changes, destroy it on the way out. Destroying matters — the canvas, its
 * listeners and its resize observer all belong to the instance.
 */
export function ProgressChart({
  points,
  metric,
  label,
}: {
  points: ExerciseProgressPoint[];
  metric: ProgressMetric;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;

    if (!element) {
      return;
    }

    const series = buildChartSeries(points, metric);

    const plot = new uPlot(
      {
        width: element.clientWidth || 320,
        height: 220,
        series: [{}, { label, stroke: '#6c5ce7', width: 2, points: { show: true } }],
        scales: { x: { time: true } },
        axes: [
          {
            /*
             * Formatted in UTC, and that is not a detail: the x values are midnight UTC by
             * construction (`buildChartSeries`), and letting the axis read them in local time would
             * slide every point a day for anyone west of Greenwich — the same trap the history list
             * avoids by never turning its date string into a `Date`.
             */
            values: (_self: unknown, ticks: number[]) =>
              ticks.map((tick) =>
                new Intl.DateTimeFormat('es', {
                  day: '2-digit',
                  month: '2-digit',
                  timeZone: 'UTC',
                }).format(new Date(tick * 1000)),
              ),
          },
          {},
        ],
      },
      [series.x, series.y],
      element,
    );

    return () => plot.destroy();
  }, [points, metric, label]);

  return <div ref={host} className="mt-3" />;
}

import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { axisSpan, buildChartSeries } from '../../lib/progress-api.ts';
import type { ExerciseProgressPoint, ProgressMetric } from '../../lib/progress-api.ts';
import type { WeightUnit } from '../../lib/units.ts';

/**
 * The two colours this chart is painted with, copied in by value.
 *
 * uPlot paints into a canvas and a canvas resolves no custom property, so `var(--color-text)` cannot
 * be written here. `CHART_INK` is `--color-text` and `CHART_RULE` is `--color-rule`, both declared in
 * `src/index.css`, and a test reads that file and fails the day one of them moves without this one:
 * a duplicated value that nothing checks drifts in silence.
 *
 * The series is ink — the abandoned violet went with the rest of the old world — and the chart's own
 * lines are the rule the page is printed with.
 */
export const CHART_INK = '#16171b';
export const CHART_RULE = '#d8d6cf';

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
  /**
   * The unit the values are plotted in, and it is also the series' label.
   *
   * One prop and not two on purpose: the axis legend *is* the unit, and letting a screen pass a
   * label that disagrees with the conversion would print "kg" over pounds. `buildChartSeries`
   * converts the stored kilos to this unit on the way in, so uPlot only ever plots what the user
   * reads.
   */
  label: WeightUnit;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;

    if (!element) {
      return;
    }

    const series = buildChartSeries(points, metric, label);

    const plot = new uPlot(
      {
        width: element.clientWidth || 320,
        height: 220,
        series: [{}, { label, stroke: CHART_INK, width: 2, points: { show: true } }],
        /*
         * The span is given explicitly because uPlot's automatic one invents a range when the series
         * has a single reading, and then prints ticks for days no reading happened on — the chart
         * claiming a history it does not have. `axisSpan` is where that arithmetic is tested.
         */
        scales: {
          x: {
            time: true,
            range: (_self: unknown, min: number, max: number) => axisSpan(min, max),
          },
        },
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
            ...chartLines(),
          },
          chartLines(),
        ],
      },
      [series.x, series.y],
      element,
    );

    return () => plot.destroy();
  }, [points, metric, label]);

  return <div ref={host} className="mt-3" />;
}

/**
 * The grid, the ticks and the axis values, in the world's own two colours.
 *
 * uPlot ships `rgba(0, 0, 0, 0.07)` for the grid and the ticks — a black wash that belongs to no
 * world — and `hexBlack` for the axis values, so both are stated here instead of inherited. The grid
 * and the ticks are the printed rule of the page, which is what the rule token is for.
 *
 * The axis values are ink and deliberately not the rule colour. Read as one phrase, "the grid/axis
 * becomes the rule" would paint the dates in a line colour: at 1.3:1 against the paper they could
 * not be read, and the rule is a line, not a letter. Ink is the world's text colour and it stops
 * the axis from using the library's black.
 *
 * A function and not a shared object: uPlot defaults the options it is handed by writing back into
 * them, so two axes pointing at one object would be two axes sharing whatever the library put there.
 */
function chartLines() {
  return {
    grid: { stroke: CHART_RULE },
    ticks: { stroke: CHART_RULE },
    stroke: CHART_INK,
  };
}

import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { buildBodyWeightSeries } from '../../lib/body-weight-api.ts';
import type { BodyWeightPoint } from '../../lib/body-weight-api.ts';
import type { WeightUnit } from '../../lib/units.ts';

/**
 * The two colours this chart is painted with, copied in by value.
 *
 * uPlot paints into a canvas and a canvas resolves no custom property, so `var(--color-text)` cannot
 * be written here. `CHART_INK` is `--color-text` and `CHART_RULE` is `--color-rule`, both declared in
 * `src/index.css`, and a test reads that file and fails the day one of them moves without this one.
 *
 * The progress chart carries its own copy of the same two values for the same reason: they are the
 * chart module's own constants, and one chart importing the other's module would drag uPlot into a
 * second chunk to borrow two strings.
 */
export const CHART_INK = '#16171b';
export const CHART_RULE = '#d8d6cf';

/**
 * The body-weight line, drawn by uPlot.
 *
 * This module exists as its own file so it can be loaded on demand: uPlot is around 50 kB and only
 * this section needs it, so it travels in a chunk of its own rather than in the one every route pays
 * for. That is the plan's requirement (S11) and not a preference.
 *
 * uPlot owns a canvas and draws imperatively, so this is a `useEffect` and not markup: create the plot
 * when the data changes, destroy it on the way out. Destroying matters — the canvas, its listeners and
 * its resize observer all belong to the instance.
 */
export function BodyWeightChart({
  points,
  label,
}: {
  points: BodyWeightPoint[];
  /**
   * The unit the values are plotted in, and it is also the series' label.
   *
   * One prop and not two on purpose: the axis legend *is* the unit, and letting a screen pass a label
   * that disagrees with the conversion would print "kg" over pounds. `buildBodyWeightSeries` converts
   * the stored kilos to this unit on the way in, so uPlot only ever plots what the user reads.
   */
  label: WeightUnit;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;

    if (!element) {
      return;
    }

    const series = buildBodyWeightSeries(points, label);

    const plot = new uPlot(
      {
        width: element.clientWidth || 320,
        // A mini-chart: shorter than the progress chart because it shares the screen with the input
        // and the figures above it.
        height: 160,
        series: [{}, { label, stroke: CHART_INK, width: 2, points: { show: true } }],
        scales: { x: { time: true } },
        axes: [
          {
            /*
             * Formatted in UTC, like the progress chart: the x values are midnight UTC by construction
             * (`buildBodyWeightSeries`), and letting the axis read them in local time would slide every
             * point a day for anyone west of Greenwich.
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
  }, [points, label]);

  return <div ref={host} className="mt-3" />;
}

/**
 * The grid, the ticks and the axis values, in the world's own two colours.
 *
 * uPlot ships a black wash for the grid and the ticks and `hexBlack` for the axis values, so both are
 * stated here instead of inherited. A function and not a shared object: uPlot defaults the options it
 * is handed by writing back into them, so two axes pointing at one object would share whatever the
 * library put there.
 */
function chartLines() {
  return {
    grid: { stroke: CHART_RULE },
    ticks: { stroke: CHART_RULE },
    stroke: CHART_INK,
  };
}

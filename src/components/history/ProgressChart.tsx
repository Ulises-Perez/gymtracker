import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { axisSpan, buildChartSeries, dayIncrements } from '../../lib/progress-api.ts';
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
   * The unit the values are plotted in.
   *
   * It travels as one prop and not two: the numbers are converted with it, so a screen cannot hand a
   * value and a unit that disagree and print "kg" over pounds. `buildChartSeries` converts the stored
   * kilos on the way in, so this component only ever draws what the user reads. The chart states no
   * legend of its own — that is uPlot's markup, and it read as scaffolding in a world of paper and
   * rules — and the unit reads on the chips of the screen that owns it.
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

    const height = 220;

    const plot = new uPlot(
      {
        width: element.clientWidth || 320,
        height,
        /*
         * No legend. uPlot draws its own, and it arrived with the library's markup and a pair of
         * bare dashes into a world of paper and rules — the one screen that read as scaffolding. The
         * unit it used to state reads on the chips above, which is where someone chooses what they
         * are looking at, and the label still travels for the conversion.
         */
        legend: { show: false },
        series: [{}, { label, stroke: CHART_INK, width: 2, points: { show: true } }],
        /*
         * The span comes from the series and **not from the two numbers uPlot passes**, which is the
         * whole reason this is a zero-argument closure: uPlot calls a range with `(self, null, null,
         * key)` when it recomputes the axis, and a version that trusted those arguments answered
         * `null === null` as "a single reading" and produced a span around 1970. The axis then fell
         * back to its own zero-width range — the point on the left edge and ticks for days that are in
         * no reading — and the fix did nothing at all. `axisSpan` is where that is tested.
         */
        scales: {
          x: {
            time: true,
            range: () => axisSpan(series.x),
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
            /*
             * And the axis may only step in days. Without this it takes hours over the two-day span
             * a single reading gets, and since the labels carry the day alone, the same date lands
             * two or three times in a row — an axis that looks like it has four ticks and two days.
             * The readings are daily, so this is the axis agreeing with the data.
             */
            incrs: dayIncrements(),
            ...chartLines(),
          },
          {
            ...chartLines(),
            /*
             * The y values are numbers a person reads, so they carry the comma the rest of
             * the app writes. uPlot's default formatter prints `72.5`; the set card and the
             * rows print `72,5`, and one datum cannot have two separators.
             */
            values: (_self: unknown, ticks: number[]) =>
              ticks.map((tick) => String(tick).replace('.', ',')),
          },
        ],
      },
      [series.x, series.y],
      element,
    );

    /*
     * The canvas is created at the width the column has **at mount**, and a rotation or a
     * window resize does not re-run this effect. uPlot 1.6 has no observer of its own, so
     * without this the chart keeps its old width and hangs out of the page (or short of it)
     * after a rotation. The observer is the instance's own and disconnects with it.
     */
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const width = element.clientWidth;

            if (width > 0) {
              plot.setSize({ width, height });
            }
          });

    observer?.observe(element);

    return () => {
      observer?.disconnect();
      plot.destroy();
    };
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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BodyWeightPoint } from '../../lib/body-weight-api.ts';
import { BodyWeightChart, CHART_INK, CHART_RULE } from './BodyWeightChart.tsx';

/*
 * The stylesheet as text, and read by Node rather than imported with `?raw`: Vitest stubs every
 * `.css` request to an empty module, which is why a raw import comes back blank here. The directive
 * is this app's own tsconfig and not a shortcut: `src` is typed for the browser, so a Node builtin
 * has no types in it.
 */
// @ts-expect-error -- Node builtins are not typed in the browser tsconfig that covers `src`
import { readFileSync } from 'node:fs';

/*
 * uPlot draws into a canvas and jsdom has none, so this file cannot test the drawing. What it can test
 * is everything around it that is the component's own: the series it hands over, the unit it is
 * labelled with, and that the instance is destroyed on the way out. The same limit the progress chart
 * declares applies here.
 */

const { destroy, uplot } = vi.hoisted(() => ({ destroy: vi.fn(), uplot: vi.fn() }));

vi.mock('uplot', () => ({ default: uplot }));

const POINTS: BodyWeightPoint[] = [{ date: '2026-10-13', weightKg: 72.5 }];

beforeEach(() => {
  uplot.mockReset();
  destroy.mockReset();
  /*
   * A regular function and an implementation, not a return value: the component calls this with `new`,
   * and returning an object from a constructor is what makes `plot.destroy` exist.
   */
  uplot.mockImplementation(function () {
    return { destroy };
  });
});

describe('BodyWeightChart', () => {
  it('builds the two axes from the points and hands them to uPlot', () => {
    render(<BodyWeightChart points={POINTS} label="kg" />);

    expect(uplot).toHaveBeenCalledTimes(1);

    const call = uplot.mock.calls[0] as [unknown, number[][]];

    expect(call[1][0]).toEqual([Date.parse('2026-10-13T00:00:00Z') / 1000]);
    expect(call[1][1]).toEqual([72.5]);
  });

  it('plots the values in the unit it is labelled with', () => {
    render(<BodyWeightChart points={POINTS} label="lb" />);

    const call = uplot.mock.calls[0] as [{ series: { label?: string }[] }, number[][]];

    // The conversion happened in `buildBodyWeightSeries`, at the reading edge, so uPlot is handed the
    // pounds with the axis label that names them and the two cannot disagree.
    expect(call[1][1]).toEqual([72.5 / 0.45359237]);
    expect(call[0].series.at(1)?.label).toBe('lb');
  });

  it('destroys the instance on the way out', () => {
    const { unmount } = render(<BodyWeightChart points={POINTS} label="kg" />);

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

/*
 * The canvas colours cannot be written as `var(--color-text)`: a canvas resolves no custom property, so
 * the world's values are copied into the component by value. This keeps the copy honest — it reads
 * `src/index.css` and fails the day a token moves without the constant.
 */
describe('BodyWeightChart colours', () => {
  it('paints with the world tokens and keeps its literals equal to them', () => {
    render(<BodyWeightChart points={POINTS} label="kg" />);

    const call = uplot.mock.calls[0] as [
      { series: { stroke?: string }[]; axes: { grid?: { stroke?: string } }[] },
      number[][],
    ];

    expect(call[0].series.at(1)?.stroke).toBe(CHART_INK);
    expect(call[0].axes.map((axis) => axis.grid?.stroke)).toEqual([CHART_RULE, CHART_RULE]);

    const css = readFileSync('src/index.css', 'utf8');

    expect(tokenValue(css, 'color-text')).toBe(CHART_INK);
    expect(tokenValue(css, 'color-rule')).toBe(CHART_RULE);
  });
});

function tokenValue(css: string, name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase();
}

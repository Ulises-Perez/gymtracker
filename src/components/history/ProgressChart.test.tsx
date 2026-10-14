import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExerciseProgressPoint } from '../../lib/progress-api.ts';
import { CHART_INK, CHART_RULE, ProgressChart } from './ProgressChart.tsx';

/*
 * The stylesheet as text, and read by Node rather than imported with `?raw`: Vitest stubs every
 * `.css` request to an empty module, which is the right default for a unit test and is why a raw
 * import comes back blank here.
 *
 * The directive is this app's own tsconfig and not a shortcut around a missing type package: `src`
 * is typed for the browser (`types: ["vite/client"]`), so a Node builtin has no types in it, and
 * widening the app's compiler options for one test would be the tail wagging the dog.
 */
// @ts-expect-error -- Node builtins are not typed in the browser tsconfig that covers `src`
import { readFileSync } from 'node:fs';

/*
 * uPlot draws into a canvas, and jsdom has none, so this file cannot test the drawing. What it can
 * test is everything around it that is the component's own: that the series it hands over is built
 * from the points it was given, that an exercise with no sessions does not explode, and that the
 * instance is destroyed on the way out — the canvas, its listeners and its observers all belong to it.
 */

const { destroy, uplot } = vi.hoisted(() => ({ destroy: vi.fn(), uplot: vi.fn() }));

vi.mock('uplot', () => ({ default: uplot }));

const POINTS: ExerciseProgressPoint[] = [
  { date: '2026-10-13', maxWeight: 70, volume: 1750, oneRm: 81.67, sets: 3 },
];

beforeEach(() => {
  uplot.mockReset();
  destroy.mockReset();
  /*
   * A regular function and not an arrow, and an implementation and not a return value: the component
   * calls this with `new`, and vitest refuses `mockReturnValue` for a mock used that way. Returning an
   * object from a constructor is legal JavaScript and is what makes `plot.destroy` exist.
   */
  uplot.mockImplementation(function () {
    return { destroy };
  });
});

describe('ProgressChart', () => {
  it('builds the two axes from the points and hands them to uPlot', () => {
    render(<ProgressChart points={POINTS} metric="maxWeight" label="kg" />);

    expect(uplot).toHaveBeenCalledTimes(1);

    const call = uplot.mock.calls[0] as [unknown, number[][]];

    // The x axis in seconds from midnight UTC, which is what the axis formatter reads back.
    expect(call[1][0]).toEqual([Date.parse('2026-10-13T00:00:00Z') / 1000]);
    expect(call[1][1]).toEqual([70]);
    expect(call[0]).toMatchObject({ height: 220 });
  });

  it('plots the metric that was asked for', () => {
    render(<ProgressChart points={POINTS} metric="volume" label="kg" />);

    const call = uplot.mock.calls[0] as [unknown, number[][]];

    expect(call[1][1]).toEqual([1750]);
  });

  it('survives an exercise with no sessions instead of failing to draw', () => {
    // A brand new exercise is a real state, not an error: the screen says so and the chart is simply
    // not rendered, but the component must still be safe to mount.
    render(<ProgressChart points={[]} metric="maxWeight" label="kg" />);

    expect(uplot).toHaveBeenCalledTimes(1);
  });

  it('destroys the instance on the way out', () => {
    const { unmount } = render(<ProgressChart points={POINTS} metric="oneRm" label="kg" />);

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

/*
 * The canvas colours cannot be written as `var(--color-text)`: uPlot paints into a canvas, and a
 * canvas resolves no custom property. So the world's values are copied into the component by value,
 * and this is the test that keeps the copy honest -- it reads `src/index.css` and fails the day one of
 * them moves without the constant, which is the only way that duplication can drift without saying so.
 *
 * It also asserts that the constants are the ones the plot is painted with. A constant nothing used
 * would satisfy the comparison above while the chart quietly kept a colour of its own.
 */
describe('ProgressChart colours', () => {
  it('paints with the world tokens and keeps its literals equal to them', () => {
    render(<ProgressChart points={POINTS} metric="maxWeight" label="kg" />);

    const call = uplot.mock.calls[0] as [
      { series: { stroke?: string }[]; axes: { grid?: { stroke?: string } }[] },
      number[][],
    ];

    expect(call[0].series.at(1)?.stroke).toBe(CHART_INK);
    expect(call[0].axes.map((axis) => axis.grid?.stroke)).toEqual([CHART_RULE, CHART_RULE]);

    // The stylesheet as it is written. Vitest's working directory is the project root, which is
    // where `src/index.css` is.
    const css = readFileSync('src/index.css', 'utf8');

    expect(tokenValue(css, 'color-text')).toBe(CHART_INK);
    expect(tokenValue(css, 'color-rule')).toBe(CHART_RULE);
  });
});

/**
 * The value of one declaration in `index.css`, or undefined when the token is gone. Both are a
 * failure, and this tells them apart in the report instead of collapsing them into a mismatch.
 */
function tokenValue(css: string, name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase();
}

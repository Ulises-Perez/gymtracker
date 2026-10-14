import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExerciseProgressPoint } from '../../lib/progress-api.ts';
import { ProgressChart } from './ProgressChart.tsx';

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

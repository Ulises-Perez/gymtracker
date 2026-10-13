import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRestTimer } from './useRestTimer.ts';

const T0 = new Date('2026-10-13T10:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRestTimer', () => {
  it('is idle until it is started', () => {
    const { result } = renderHook(() => useRestTimer(90));

    expect(result.current.isRunning).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it('counts down from the rest length it was given', () => {
    const { result } = renderHook(() => useRestTimer(90));

    act(() => result.current.start());

    expect(result.current.isRunning).toBe(true);
    expect(result.current.remainingMs).toBe(90_000);
  });

  it('counts the time down as it passes', () => {
    const { result } = renderHook(() => useRestTimer(90));
    act(() => result.current.start());

    act(() => void vi.advanceTimersByTime(30_000));

    expect(result.current.remainingMs).toBe(60_000);
    expect(result.current.isRunning).toBe(true);
  });

  /**
   * The reason the timer is stored as an end timestamp instead of a countdown
   * that ticks down: iOS freezes timers in a backgrounded tab, so a countdown
   * would come back frozen and a two-minute rest would still show two minutes
   * after ten. Computing the remainder from the clock means the number is right
   * the moment the screen wakes up again, whatever happened in between.
   */
  it('catches up after the tab was frozen, because the clock kept running', () => {
    const { result } = renderHook(() => useRestTimer(120));
    act(() => result.current.start());

    // Half the rest passes normally.
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current.remainingMs).toBe(90_000);

    // The tab is frozen for a minute: the clock moves but no tick ever fires.
    act(() => vi.setSystemTime(T0 + 90_000));

    // Coming back to the screen is what makes it recalculate.
    act(() => void document.dispatchEvent(new Event('visibilitychange')));

    expect(result.current.remainingMs).toBe(30_000);
  });

  it('stops being running when the rest is over', () => {
    const { result } = renderHook(() => useRestTimer(60));
    act(() => result.current.start());

    act(() => void vi.advanceTimersByTime(60_000));

    expect(result.current.remainingMs).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('never goes negative, however long the tab was away', () => {
    const { result } = renderHook(() => useRestTimer(60));
    act(() => result.current.start());

    act(() => vi.setSystemTime(T0 + 3_600_000));
    act(() => void document.dispatchEvent(new Event('visibilitychange')));

    expect(result.current.remainingMs).toBe(0);
  });

  it('can be stopped early', () => {
    const { result } = renderHook(() => useRestTimer(90));
    act(() => result.current.start());

    act(() => result.current.stop());

    expect(result.current.isRunning).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it('restarts cleanly after being stopped', () => {
    const { result } = renderHook(() => useRestTimer(90));
    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(30_000));
    act(() => result.current.stop());

    act(() => result.current.start());

    expect(result.current.remainingMs).toBe(90_000);
  });
});

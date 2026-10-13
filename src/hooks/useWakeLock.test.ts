import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWakeLock } from './useWakeLock.ts';

/**
 * The slice of the Wake Lock API the app uses, with the escape hatch a test needs:
 * the browser drops the lock on its own when the page is hidden, and it does not
 * tell anyone except through the sentinel's `release` event.
 */
type Sentinel = {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, listener: () => void) => void;
  /** What the browser does when it drops the lock by itself: the page was hidden. */
  emitRelease: () => void;
};

function createSentinel(): Sentinel {
  const listeners: (() => void)[] = [];

  const announce = () => {
    sentinel.released = true;
    listeners.forEach((listener) => listener());
  };

  const sentinel: Sentinel = {
    released: false,
    // The real sentinel fires `release` whether it was asked to or not.
    release: vi.fn(async () => announce()),
    addEventListener: (_type, listener) => listeners.push(listener),
    emitRelease: announce,
  };

  return sentinel;
}

/** Installs a fake Wake Lock API. Returns the request spy and the last sentinel. */
function stubWakeLock() {
  const sentinels: Sentinel[] = [];
  const request = vi.fn(async () => {
    const sentinel = createSentinel();

    sentinels.push(sentinel);

    return sentinel;
  });

  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });

  return { request, sentinels };
}

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  setVisibility('visible');
});

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  setVisibility('visible');
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('leaves the device alone while there is no workout running', () => {
    const { request } = stubWakeLock();

    renderHook(() => useWakeLock(false));

    expect(request).not.toHaveBeenCalled();
  });

  it('holds the screen awake while the workout runs', async () => {
    const { request } = stubWakeLock();

    renderHook(() => useWakeLock(true));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen');
    });
  });

  /**
   * An app that keeps the screen on after the workout is over is an app that
   * drains a phone in a gym bag.
   */
  it('lets go when the workout ends', async () => {
    const { sentinels } = stubWakeLock();

    const { rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    });

    await waitFor(() => expect(sentinels).toHaveLength(1));

    rerender({ on: false });

    expect(sentinels[0]?.release).toHaveBeenCalled();
  });

  it('lets go when the screen goes away', async () => {
    const { sentinels } = stubWakeLock();

    const { unmount } = renderHook(() => useWakeLock(true));

    await waitFor(() => expect(sentinels).toHaveLength(1));

    unmount();

    expect(sentinels[0]?.release).toHaveBeenCalled();
  });

  /**
   * The lock is dropped by the browser whenever the page is hidden and nothing
   * announces it to the app, so coming back to the screen is the only signal there
   * is that it has to be taken again.
   */
  it('takes the lock again after the page was hidden', async () => {
    const { request, sentinels } = stubWakeLock();

    renderHook(() => useWakeLock(true));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // The browser dropped it while the page was hidden, and announced it the only
    // way it does: on the sentinel itself.
    setVisibility('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    act(() => sentinels[0]?.emitRelease());

    setVisibility('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it('does not ask twice for a lock it is already holding', async () => {
    const { request } = stubWakeLock();

    renderHook(() => useWakeLock(true));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    act(() => void document.dispatchEvent(new Event('visibilitychange')));

    expect(request).toHaveBeenCalledTimes(1);
  });

  /**
   * iOS only got this API in 16.4, and only for installed PWAs. Missing support
   * means the screen may dim mid-set; it does not mean the workout breaks, and it
   * is not worth a message the user can do nothing about.
   */
  it('shrugs when the device does not have the API', () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('shrugs when the request is refused', async () => {
    const request = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });

    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();

    await waitFor(() => expect(request).toHaveBeenCalled());
  });
});

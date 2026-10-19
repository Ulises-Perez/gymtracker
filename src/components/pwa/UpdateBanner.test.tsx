import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

import { registerServiceWorker } from '../../lib/pwa.ts';
import { UpdateBanner } from './UpdateBanner.tsx';

/**
 * The update banner, and the one thing it must never do on its own.
 *
 * The plan's gotcha is explicit: an update landing mid-set cannot reload the app under the user's
 * fingers. `registerType: 'prompt'` keeps the new worker waiting, so what is asserted here is that a
 * waiting worker only produces a question, and that the reload is triggered by the accept — never by
 * the download.
 */

const pwa = vi.hoisted(() => ({ registerSW: vi.fn() }));

vi.mock('virtual:pwa-register', () => ({ registerSW: pwa.registerSW }));

/** The plugin's own handle: sending `SKIP_WAITING` is what lets the new worker take over. */
let updateServiceWorker: ReturnType<typeof vi.fn>;

/** What the app handed to `registerSW`, which is where the plugin reports the waiting worker. */
function registration(): RegisterSWOptions {
  const options = pwa.registerSW.mock.calls[0]?.[0];

  if (options === undefined) {
    throw new Error('registerServiceWorker() did not reach registerSW()');
  }

  return options as RegisterSWOptions;
}

/** The plugin calls `onNeedRefresh` when a downloaded worker is waiting for permission. */
function workerIsWaiting() {
  act(() => {
    registration().onNeedRefresh?.();
  });
}

beforeEach(() => {
  localStorage.clear();

  // The registration is skipped without the API, and jsdom has no service worker at all.
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: {} });

  updateServiceWorker = vi.fn().mockResolvedValue(undefined);
  pwa.registerSW.mockReturnValue(updateServiceWorker);

  registerServiceWorker();
});

afterEach(() => {
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
  vi.clearAllMocks();
});

describe('the new version banner', () => {
  it('says nothing while the running worker is the current one', () => {
    render(<UpdateBanner />);

    // Silence is the resting state: an update is news, and a permanent banner would be furniture.
    expect(screen.queryByText(/nueva versión/)).not.toBeInTheDocument();
    expect(pwa.registerSW).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
  });

  /**
   * The banner is the user's question, and asking it must not answer it. The plugin's callback fires
   * while the app is in use — possibly in the middle of a set — so nothing may reload here.
   */
  it('asks before reloading: a waiting worker shows the banner and reloads nothing', () => {
    render(<UpdateBanner />);

    workerIsWaiting();

    expect(screen.getByText(/nueva versión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    // The old app is still the running app: `SKIP_WAITING` has not been sent.
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('updates only when the user accepts', async () => {
    render(<UpdateBanner />);
    workerIsWaiting();

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    /*
     * `updateServiceWorker()` is the plugin's own sequence: it posts `SKIP_WAITING` to the waiting
     * worker and the reload happens on the `controlling` event that follows. It is called with no
     * argument because this version ignores `reloadPage` and reads the intent from the listener it
     * registered when it reported the waiting worker.
     */
    await waitFor(() => {
      expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    });
    expect(updateServiceWorker).toHaveBeenCalledWith();
  });
});

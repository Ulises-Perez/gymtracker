import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installPersistFlush } from './persist-flush.ts';
import { QUERY_CACHE_KEY, queryClient } from './queryClient.ts';
import { indexedDbStorage } from './storage.ts';

/**
 * Reads back the query keys the last write left on disk.
 *
 * The assertion goes through storage rather than through a function that reports
 * success: what has to hold is that a cache written by the flush is readable in
 * the format the restore path expects, and only the bytes on disk prove that.
 */
async function persistedQueryKeys(): Promise<string[]> {
  const raw = await indexedDbStorage.getItem(QUERY_CACHE_KEY);
  const persisted = JSON.parse(raw ?? '{}') as {
    clientState?: { queries?: { queryKey: unknown }[] };
  };

  return (persisted.clientState?.queries ?? []).map((query) => JSON.stringify(query.queryKey));
}

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

let uninstall: (() => void) | null = null;

beforeEach(() => {
  queryClient.clear();
  // Something to persist, so a write that only stored an empty envelope would
  // still fail this test.
  queryClient.setQueryData(['catalogo'], [{ id: 'press-banca' }]);

  uninstall = installPersistFlush();
});

afterEach(async () => {
  uninstall?.();
  uninstall = null;

  await indexedDbStorage.removeItem(QUERY_CACHE_KEY);
  queryClient.clear();
  setVisibility('visible');
});

describe('flushing the queue on the way out', () => {
  /**
   * The window this closes is a wall-clock one: the persister throttles its
   * writes, so the last seconds of a session can still be in memory when the tab
   * goes away. `pagehide` is the last event a closing tab or an installed PWA
   * reliably emits.
   */
  it('writes the cache when the page is about to be unloaded', async () => {
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(async () => {
      expect(await persistedQueryKeys()).toContain('["catalogo"]');
    });
  });

  /**
   * Mobile needs this one as well: backgrounding an app often produces no
   * `pagehide` at all, so hiding is the only signal available.
   */
  it('writes the cache when the page becomes hidden', async () => {
    setVisibility('hidden');

    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(async () => {
      expect(await persistedQueryKeys()).toContain('["catalogo"]');
    });
  });

  /**
   * `visibilitychange` also fires on the way back to visible, and flushing on
   * every one of those would write the whole cache on each tab switch.
   */
  it('does not write while the page is still visible', async () => {
    setVisibility('visible');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(await indexedDbStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
  });

  it('stops listening once it is uninstalled', async () => {
    uninstall?.();
    uninstall = null;

    window.dispatchEvent(new Event('pagehide'));

    expect(await indexedDbStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
  });
});

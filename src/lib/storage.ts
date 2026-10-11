import { createStore, del, get, set } from 'idb-keyval';

/**
 * One IndexedDB-backed key/value storage shared by the query cache persister and
 * the Zustand store.
 *
 * The same object satisfies both contracts because TanStack's `AsyncStorage` and
 * Zustand's `StateStorage` expose the same three members with the same
 * signatures. `localStorage` would be the wrong home for either: it is
 * synchronous, capped at a few megabytes, and string-only.
 */
const store = createStore('gymtracker', 'keyval');

export const indexedDbStorage = {
  getItem: async (key: string): Promise<string | null> => (await get<string>(key, store)) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    await set(key, value, store);
  },
  removeItem: async (key: string): Promise<void> => {
    await del(key, store);
  },
};

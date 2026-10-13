/*
 * IndexedDB is where the draft and the queue live, so anything that renders a screen can
 * reach it: the draft is written on every change, and a successful save clears it.
 *
 * It belongs here rather than in each test file that happens to need it. The app installs the
 * sync subscription at startup (`installSaveSync`), so the workout screen exercises that write
 * path too — and with the polyfill imported per file, forgetting it failed as `indexedDB is
 * not defined` raised from inside a storage promise, nowhere near the test that caused it.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * Testing Library only auto-registers its cleanup when the test globals are
 * enabled. This project keeps `globals` off so application code never sees
 * test globals, which means cleanup has to be wired explicitly — without it the
 * DOM accumulates across tests in a file and role queries find duplicates.
 */
afterEach(() => {
  cleanup();
});

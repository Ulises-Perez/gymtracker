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

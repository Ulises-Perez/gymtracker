import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ERROR_LOG_LIMIT,
  ERROR_SOURCES,
  clearErrorLog,
  installGlobalErrorHandlers,
  logError,
  readErrorLog,
} from './logging.ts';
import type { ErrorSource } from './logging.ts';

/**
 * The contract of the error log, not its implementation.
 *
 * Three rules decide every assertion here, and each one is a reason a real logger would have
 * been wrong for this product:
 *
 * 1. No personal data. The app stores body weight and training history, so a logger that
 *    accepted a free metadata object would be a copy of user context waiting to happen. The
 *    API takes the error and a label from a closed set, and the tests prove that a payload
 *    attached to the error —or thrown instead of one— does not make it into the buffer.
 * 2. No console. The DoD asks for a clean console, so a logger that printed would defeat the
 *    reason it exists.
 * 3. No disk and no network. The history is already on the device; an error file would be a
 *    second copy of context nobody asked for, which is the same reason Sentry is not installed.
 */

const ERROR_KEYS = ['at', 'message', 'name', 'source', 'stack'];

function freshModule(): Promise<typeof import('./logging.ts')> {
  vi.resetModules();

  return import('./logging.ts');
}

function errorWithStack(message: string, stack: string): Error {
  const error = new Error(message);

  error.stack = stack;

  return error;
}

beforeEach(() => {
  clearErrorLog();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearErrorLog();
});

describe('logError', () => {
  it('keeps at most fifty entries and drops the oldest one', () => {
    for (let index = 1; index <= ERROR_LOG_LIMIT + 5; index += 1) {
      logError(new Error(`falla ${index}`), 'render');
    }

    const entries = readErrorLog();

    expect(entries).toHaveLength(ERROR_LOG_LIMIT);
    expect(ERROR_LOG_LIMIT).toBe(50);
    expect(entries[0]?.message).toBe('falla 6');
    expect(entries.at(-1)?.message).toBe(`falla ${ERROR_LOG_LIMIT + 5}`);
  });

  it('stores exactly the fields the contract declares, and no metadata object', () => {
    logError(new Error('boom'), 'render');

    const [entry] = readErrorLog();

    expect(Object.keys(entry!).sort()).toEqual(ERROR_KEYS);
    expect(entry?.source).toBe('render');
  });

  it('does not copy the properties someone attached to the error', () => {
    const error = Object.assign(new Error('boom'), {
      email: 'ana@example.com',
      password: 'hunter2',
      token: 'eyJhbGciOiJIUzI1NiJ9',
    });

    logError(error, 'render');

    const stored = JSON.stringify(readErrorLog());

    expect(stored).not.toContain('ana@example.com');
    expect(stored).not.toContain('hunter2');
    expect(stored).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('does not serialize a thrown object, so a stray payload cannot leak', () => {
    logError({ email: 'ana@example.com', password: 'hunter2' }, 'window');

    const [entry] = readErrorLog();

    expect(JSON.stringify(readErrorLog())).not.toContain('ana@example.com');
    expect(entry?.message).toBe('(valor inesperado)');
    expect(entry?.stack).toBeNull();
  });

  it('accepts a thrown string, which has no stack', () => {
    logError('sin conexión', 'unhandled-rejection');

    expect(readErrorLog()[0]).toMatchObject({
      source: 'unhandled-rejection',
      name: 'Error',
      message: 'sin conexión',
      stack: null,
    });
  });

  it('only accepts the three origins the set declares', () => {
    expect(ERROR_SOURCES).toEqual(['render', 'window', 'unhandled-rejection']);

    logError(new Error('boom'), 'cualquier-cosa' as unknown as ErrorSource);

    expect(readErrorLog()).toEqual([]);
  });

  it('shortens a stack instead of copying a whole framework one', () => {
    const longStack = `Error: boom\n${'    at marco (src/pages/WorkoutPage.tsx:1:1)\n'.repeat(200)}`;

    logError(errorWithStack('boom', longStack), 'render');

    const stack = readErrorLog()[0]?.stack ?? '';

    expect(longStack.length).toBeGreaterThan(5000);
    expect(stack.length).toBeLessThanOrEqual(2000);
    expect(stack.endsWith('…')).toBe(true);
  });
});

describe('readErrorLog', () => {
  it('returns a copy, so a caller cannot rewrite the log', () => {
    logError(new Error('boom'), 'window');

    const copy = readErrorLog();
    copy.length = 0;

    expect(readErrorLog()).toHaveLength(1);
  });

  it('empties on clearErrorLog', () => {
    logError(new Error('boom'), 'window');
    clearErrorLog();

    expect(readErrorLog()).toEqual([]);
  });
});

describe('the log is memory only', () => {
  it('writes nothing to the console', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logError(new Error('boom'), 'render');
    logError('sin conexión', 'unhandled-rejection');

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('persists nothing: no storage, no network, and a fresh module starts empty', async () => {
    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);

    logError(new Error('boom'), 'render');

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const fresh = await freshModule();

    expect(fresh.readErrorLog()).toEqual([]);
  });
});

describe('installGlobalErrorHandlers', () => {
  it('records uncaught errors and unhandled rejections', () => {
    const uninstall = installGlobalErrorHandlers();

    try {
      window.dispatchEvent(
        new ErrorEvent('error', { error: new Error('se rompió el render'), message: 'x' }),
      );

      const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };

      rejection.reason = new Error('la promesa no se atrapó');
      window.dispatchEvent(rejection);

      const entries = readErrorLog();

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ source: 'window', message: 'se rompió el render' });
      expect(entries[1]).toMatchObject({
        source: 'unhandled-rejection',
        message: 'la promesa no se atrapó',
      });
    } finally {
      uninstall();
    }
  });

  it('falls back to the message when the error event carries no Error', () => {
    const uninstall = installGlobalErrorHandlers();

    try {
      // A failed resource load reports a message and no error object.
      window.dispatchEvent(new ErrorEvent('error', { message: 'Fallo de carga' }));

      expect(readErrorLog()[0]).toMatchObject({ source: 'window', message: 'Fallo de carga' });
    } finally {
      uninstall();
    }
  });

  it('stops recording once it is torn down', () => {
    const uninstall = installGlobalErrorHandlers();

    uninstall();

    // The message-only event: a thrown `Error` dispatched at a window with no listener left is
    // reported by jsdom as an uncaught exception of its own, which would be noise and not signal.
    window.dispatchEvent(new ErrorEvent('error', { message: 'tarde' }));
    window.dispatchEvent(new Event('unhandledrejection'));

    expect(readErrorLog()).toEqual([]);
  });

  it('does not print to the console', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const uninstall = installGlobalErrorHandlers();

    try {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));

      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      uninstall();
    }
  });
});

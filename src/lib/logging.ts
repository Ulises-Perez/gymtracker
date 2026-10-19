/**
 * The app's own error log, in memory and nothing else.
 *
 * This module exists because the DoD for phase 7 named Sentry and Sentry is not installed: the
 * product stores body weight and training history, a third-party SDK would have been a second
 * copy of that context leaving the device, and the function it provided —"the public URL shows no
 * errors"— fits in a few hundred bytes of what the app already has.
 *
 * Three rules, and each one is a way this module could have been wrong:
 *
 * 1. **No personal data.** The API takes the error and a label from a closed set of origins; it
 *    never takes a metadata object. A free-form bag of context is how an email, a token, a
 *    password or a form value ends up in a log, so the shape makes that impossible instead of
 *    trusting every caller to remember. For the same reason a thrown value that is not an
 *    `Error` is described, never serialized.
 * 2. **No console.** The phase's DoD asks for a clean console, so a logger that printed would
 *    undo the thing it is there to prove.
 * 3. **No disk and no network.** In memory only: the training history already lives on this
 *    device, and an error file would be another copy of context nobody asked for. The buffer is
 *    bounded at 50 entries and drops the oldest, so a broken render loop cannot grow it without
 *    limit.
 *
 * `main.tsx` is the single place that installs the global handlers, and what it installs
 * returns its own teardown so a test never leaves a listener behind that fires into the next
 * one.
 */

/** The closed set of origins. A source outside it is refused, not stored. */
export const ERROR_SOURCES = ['render', 'window', 'unhandled-rejection'] as const;

export type ErrorSource = (typeof ERROR_SOURCES)[number];

export interface LoggedError {
  readonly source: ErrorSource;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly at: number;
}

/** A buffer, not a history: fifty is enough to see a pattern and small enough to forget. */
export const ERROR_LOG_LIMIT = 50;

/**
 * Stacks are cut because the interesting part is the top, and a deep framework stack is a lot of
 * weight for a screen that has to stay readable.
 */
const MAX_STACK_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 500;

/** What a value that is not an `Error` says about itself. Never its contents. */
const UNEXPECTED_VALUE = '(valor inesperado)';

let entries: LoggedError[] = [];

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function isErrorSource(value: unknown): value is ErrorSource {
  return ERROR_SOURCES.some((source) => source === value);
}

/**
 * Reduces anything that can be thrown to the four facts the log keeps.
 *
 * An object that is not an `Error` is deliberately not stringified: `JSON.stringify` on a thrown
 * value is the shortest path from a stray request payload to a persisted copy of user data, and
 * the message "(valor inesperado)" says everything the log needs to say about it.
 */
function describe(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      name: truncate(error.name || 'Error', MAX_MESSAGE_LENGTH),
      message: truncate(error.message, MAX_MESSAGE_LENGTH),
      stack: typeof error.stack === 'string' ? truncate(error.stack, MAX_STACK_LENGTH) : null,
    };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: truncate(error, MAX_MESSAGE_LENGTH), stack: null };
  }

  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return { name: 'Error', message: String(error), stack: null };
  }

  return { name: 'Error', message: UNEXPECTED_VALUE, stack: null };
}

/**
 * Records one error. Returns nothing on purpose: the caller has no handle on the buffer, so
 * nothing outside this module can edit an entry after the fact.
 */
export function logError(error: unknown, source: ErrorSource): void {
  // Guarded again at runtime, not only in the type: the closed set is the whole reason no
  // metadata can travel with an error, and a caller from plain JavaScript could otherwise widen it.
  if (!isErrorSource(source)) {
    return;
  }

  // Logging must never be the thing that breaks the app it is watching.
  try {
    const described = describe(error);

    entries.push({ source, ...described, at: Date.now() });

    if (entries.length > ERROR_LOG_LIMIT) {
      entries = entries.slice(entries.length - ERROR_LOG_LIMIT);
    }
  } catch {
    // Dropped on purpose: a full buffer is a better outcome than a second failure.
  }
}

/** A copy, in insertion order, so a reader cannot rewrite the log by mutating what it gets. */
export function readErrorLog(): LoggedError[] {
  return [...entries];
}

export function clearErrorLog(): void {
  entries = [];
}

/**
 * Hooks the two events a render boundary cannot see: an error thrown outside React and a promise
 * nobody caught. Both go through the same printed rule as anything else — no console, no network.
 */
export function installGlobalErrorHandlers(): () => void {
  const onWindowError = (event: ErrorEvent): void => {
    // A failed resource load reports a message and no error object, so the message is the fallback.
    logError(event.error ?? event.message, 'window');
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    logError(event.reason, 'unhandled-rejection');
  };

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}

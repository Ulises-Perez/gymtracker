/**
 * What the browser already knows about the session, read without the SDK.
 *
 * The SDK keeps the session in `localStorage` under a key that ends with
 * `-auth-token` (`sb-<project-ref>-auth-token` for a hosted project), and the
 * key is looked up here in the same place the SDK writes it: reading the
 * browser's own storage is what makes this a fact about the browser instead of
 * a guess about it.
 *
 * Why it exists: the first paint used to wait for the SDK to load and answer,
 * and for a visitor without a session the answer is already in the browser.
 * The login screen is what is on screen in that case, and it was waiting for a
 * network client to learn that it should be on screen at all.
 */

/** The suffix every key the SDK stores the session under ends with. */
const SESSION_KEY_SUFFIX = '-auth-token';

/** What the browser can say about the session on its own. */
export type SessionState =
  /** Nothing in the browser: the SDK would answer the same thing. */
  | 'signed-out'
  /** A session or a link's tokens: only the SDK can answer this one. */
  | 'unknown';

/**
 * The key the SDK stores the session under, derived the same way the SDK
 * derives it, from the same URL.
 *
 * A key computed any other way would be a second, silent copy of where the
 * session lives, so this one is only a preference: the lookup falls back to
 * the keys the browser actually holds.
 */
export function authStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;

  if (!url) {
    return null;
  }

  try {
    const { hostname } = new URL(url);

    return `sb-${hostname.split('.')[0]}${SESSION_KEY_SUFFIX}`;
  } catch {
    return null;
  }
}

/**
 * Whether the browser holds a session the SDK would have to validate.
 *
 * A stored session is enough to answer "unknown": it may be expired, and only
 * the SDK can refresh it.
 */
export function hasStoredSession(): boolean {
  const storage = browserStorage();

  if (!storage) {
    return false;
  }

  for (const key of sessionKeysIn(storage)) {
    const raw = readItem(storage, key);

    if (raw === null) {
      continue;
    }

    try {
      if (isSession(JSON.parse(raw))) {
        return true;
      }
    } catch {
      // The SDK removes a value it cannot read and treats the visitor as
      // signed out, so the same answer is the honest one here.
      continue;
    }
  }

  return false;
}

/**
 * Whether the address carries the tokens of a link (recovery, invite, magic
 * link) or a PKCE code.
 *
 * The SDK reads those out of the address and turns them into a session, so
 * until it has, the answer is not known.
 */
export function urlCarriesSession(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const { hash, search } = window.location;

  return (
    hash.includes('access_token=') ||
    hash.includes('error=') ||
    hash.includes('error_description=') ||
    hash.includes('error_code=') ||
    search.includes('code=')
  );
}

/**
 * What the browser can say about the session without the SDK.
 *
 * `signed-out` is a fact: there is no session in the browser and no link in
 * the address, so there is nothing for the SDK to find.
 */
export function sessionState(): SessionState {
  const storage = browserStorage();

  if (!storage) {
    // A browser that will not let the app read its own storage is a browser
    // that will not say anything: only the SDK can answer.
    return 'unknown';
  }

  if (hasStoredSession() || urlCarriesSession()) {
    return 'unknown';
  }

  return 'signed-out';
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The keys the session could be under: the one derived from the project URL
 * first, then every key the browser holds that ends the way the SDK's does.
 */
function sessionKeysIn(storage: Storage): string[] {
  const keys: string[] = [];
  const derived = authStorageKey();

  if (derived) {
    keys.push(derived);
  }

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key && key.endsWith(SESSION_KEY_SUFFIX) && !keys.includes(key)) {
        keys.push(key);
      }
    }
  } catch {
    return keys;
  }

  return keys;
}

function readItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** The same three fields the SDK requires before it calls a value a session. */
function isSession(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.access_token === 'string' &&
    typeof candidate.refresh_token === 'string' &&
    typeof candidate.expires_at === 'number'
  );
}

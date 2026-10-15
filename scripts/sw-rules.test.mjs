// @vitest-environment node
/*
 * T7.2's routing policy, asserted where it can actually be checked.
 *
 * A service worker cannot be imported into jsdom -- it needs `self`, `caches` and a real origin -- so
 * the decisions that are dangerous to get wrong live as data in scripts/sw-rules.mjs and are asserted
 * here. The positive test pins the one route the app needs to open a deep link offline; the negative
 * tests are the reason the file exists at all: no rule may ever answer an auth request or a write with
 * a cached response, because a cached session is served to whoever asks and a cached write is a lie.
 */
import { describe, expect, it } from 'vitest';
import { APP_SHELL_ROUTE, APP_SHELL_URL, NEVER_CACHED_METHODS, SW_ROUTES } from './sw-rules.mjs';

/** A request descriptor shaped exactly like the one src/sw.ts builds from a Workbox route match. */
function request(pathname, overrides = {}) {
  return {
    pathname,
    method: 'GET',
    mode: 'cors',
    sameOrigin: true,
    ...overrides,
  };
}

/** The names of every registered rule that would answer this request. */
function rulesMatching(descriptor) {
  return SW_ROUTES.filter((rule) => rule.matches(descriptor)).map((rule) => rule.name);
}

describe('the app shell route', () => {
  it('answers a deep client route with the precached shell', () => {
    expect(rulesMatching(request('/history/abc-123', { mode: 'navigate' }))).toEqual([
      APP_SHELL_ROUTE.name,
    ]);
    expect(APP_SHELL_ROUTE.strategy).toBe('navigation-fallback');
    expect(APP_SHELL_URL).toBe('/index.html');
  });
});

describe('the negative rules', () => {
  it('has no route for an auth endpoint, not even a navigation', () => {
    expect(rulesMatching(request('/auth/v1/token'))).toEqual([]);
    expect(rulesMatching(request('/auth/v1/token', { mode: 'navigate' }))).toEqual([]);
  });

  it('has no route for the data API or storage', () => {
    expect(rulesMatching(request('/rest/v1/exercises'))).toEqual([]);
    expect(rulesMatching(request('/storage/v1/object/avatar'))).toEqual([]);
  });

  it('has no route for a write, on any path or method', () => {
    for (const method of NEVER_CACHED_METHODS) {
      expect(rulesMatching(request('/rest/v1/workouts', { method })), method).toEqual([]);
      expect(rulesMatching(request('/profile', { method })), method).toEqual([]);
    }
  });
});

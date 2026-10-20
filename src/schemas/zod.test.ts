import { describe, expect, it } from 'vitest';

import { z } from './zod.ts';

/**
 * The switch that keeps a strict CSP quiet.
 *
 * Zod v4 compiles a specialized parser for an object schema with `new Function`, and it first
 * probes the runtime with `new Function("")`. A strict `script-src` blocks that probe, the browser
 * reports the block in its Issues panel, and Lighthouse's best-practices drops for it — even
 * though Zod swallows the error and the app works perfectly.
 *
 * The assertion is the switch itself, because what it prevents is a report from the browser and
 * not a behavior of the app: nothing in the app changes when it is off. What has to stay true is
 * that it is **on** everywhere, and that happens only if every module that builds a schema imports
 * Zod through this one.
 *
 * That the validation still behaves the same with the switch on is covered by the schemas' own
 * suites: they import these modules, so the schemas they exercise are the ones built with it.
 */
describe('the zod the app builds its schemas with', () => {
  it('has the JIT compilation off, so a strict CSP does not report a violation', () => {
    expect(z.config().jitless).toBe(true);
  });
});

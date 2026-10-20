import { z } from 'zod';

/**
 * Zod, with its JIT compilation turned off.
 *
 * Zod v4 compiles a specialized parser for an object schema with `new Function`, and it first
 * asks the runtime whether it may: that probe is a `new Function("")`, which a strict
 * `script-src` blocks. Zod swallows the error, so the app keeps working — but the browser reports
 * the block in its Issues panel, and Lighthouse's best-practices drops for it. Zod ships the switch
 * for exactly this case: under `jitless` the probe is skipped and the object schemas are parsed by
 * the generic path.
 *
 * The generic path is the one **production already takes** (the CSP blocks the compilation there),
 * so this does not change what the app does: it only stops the browser from reporting the block.
 * What it does change is the development machine, which was compiling the schemas and now does
 * not — the same path, the same rules, in both places.
 *
 * Every module that builds a schema imports Zod **here**, and not from the package: the flag is
 * read when a schema is built, so it has to be set before the first one is, and the only way to
 * guarantee that is to make the switch part of the module that owns Zod.
 */
z.config({ jitless: true });

export { z };

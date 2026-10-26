import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.ts';

/**
 * The Supabase client, created on first use and shared from then on.
 *
 * The SDK is imported dynamically because a static import would put it in the
 * initial bundle, and the 180 kB budget has no room for it next to the auth
 * screens' Zod and React Hook Form (A8). The first paint needs no network
 * client, so it should not pay for one.
 *
 * Callers have to await it: `const supabase = await getSupabase()`.
 */
export type Supabase = SupabaseClient<Database>;

let client: Promise<Supabase> | null = null;

export function getSupabase(): Promise<Supabase> {
  client ??= createSupabaseClient();

  return client;
}

async function createSupabaseClient(): Promise<Supabase> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // A missing variable is a deterministic build-time mistake (Vite inlines
  // these values), so failing the promise is enough: there is nothing to retry.
  if (!url) {
    throw new Error('VITE_SUPABASE_URL is missing: copy env.example to .env and fill it in.');
  }

  if (!publishableKey) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY is missing: copy env.example to .env and fill it in.',
    );
  }

  const { createClient } = await import('@supabase/supabase-js');

  return createClient<Database>(url, publishableKey, {
    auth: {
      // The session lives in localStorage, the SDK's own default. It is a small
      // token and gains nothing from IndexedDB — unlike the query cache — so
      // keeping this storage synchronous keeps auth simple.
      persistSession: true,
      autoRefreshToken: true,
      // Confirmation and password-recovery emails come back with a one-time code
      // bound to this browser, so the client has to read it. PKCE is not the
      // default: `implicit` accepts a fragment with any valid access/refresh pair,
      // which lets an attacker send a victim a link that silently signs them into
      // the attacker's account. With PKCE, the code only exchanges against the
      // verifier this browser stored when it asked for the email — so a recovery
      // link has to be opened in the same browser that requested it.
      flowType: 'pkce',
      detectSessionInUrl: true,
    },
  });
}

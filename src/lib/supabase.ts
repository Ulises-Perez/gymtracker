import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.ts';

/**
 * The Supabase client, created on first use and shared from then on.
 *
 * The SDK is imported dynamically for the same reason as Sentry: a static
 * import would put it in the initial bundle, and the 180 kB budget has no room
 * for it next to the auth screens' Zod and React Hook Form (A8). The first
 * paint needs no network client, so it should not pay for one.
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
      // Confirmation and password-recovery emails come back with the tokens in
      // the URL fragment, so the client has to read them.
      detectSessionInUrl: true,
    },
  });
}

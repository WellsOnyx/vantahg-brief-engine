import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolves the Supabase project URL.
 *
 * NEXT_PUBLIC_SUPABASE_URL is inlined at build time by Next.js for client
 * bundles, but may be empty when the build ran without env vars (cached
 * Vercel builds).  For server-side code we also accept a plain
 * SUPABASE_URL env var which is a true runtime variable.
 */
function getUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = getUrl();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Alias for backward compatibility
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export function getServiceClient(): SupabaseClient {
  const url = getUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, serviceRoleKey);
}

/**
 * Returns true when Supabase credentials are available (either via
 * NEXT_PUBLIC_ build-time vars or server-only runtime vars).
 */
export function hasSupabaseConfig(): boolean {
  return !!(getUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Returns true when Supabase env vars are configured for the browser.
 */
export function hasBrowserSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Creates a singleton Supabase client for client-side components.
 * Uses @supabase/ssr for cookie-based auth in the browser.
 *
 * Returns null when NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * are not set (demo mode). Callers must handle the null case.
 */
export function createBrowserClient(): SupabaseClient | null {
  if (!hasBrowserSupabaseConfig()) return null;
  if (client) return client;

  client = _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
}

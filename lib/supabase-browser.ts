import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Creates a singleton Supabase client for client-side components.
 * Uses @supabase/ssr for cookie-based auth in the browser.
 */
export function createBrowserClient(): SupabaseClient {
  if (client) return client;

  client = _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  return client;
}

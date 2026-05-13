import { createClient, SupabaseClient as RealSupabaseClient } from '@supabase/supabase-js';
import { getPgShim } from './db/supabase-shim';

/**
 * Database client factory.
 *
 * Two backends:
 *   - Default: real Supabase (NEXT_PUBLIC_SUPABASE_URL + service role key)
 *   - ENABLE_AWS_DB=true: Postgres shim talking to RDS via the pg pool.
 *     The shim implements the slice of supabase-js the app uses.
 *
 * Callers don't change. `.from('cases').select()...` works the same on
 * either backend. Auth and storage are explicitly NOT in the shim -
 * those callers must use lib/adapters/auth and lib/adapters/storage.
 *
 * Type pragmatism: we declare the return type as RealSupabaseClient so
 * every existing call site keeps its type inference. When AWS_DB is on,
 * we cast the shim - it implements the .from chain Supabase callers use,
 * but its return shapes are not 100% identical (no PostgrestSingleResponse
 * vs PostgrestMaybeSingleResponse distinction, no .returns<T>() chaining).
 * Pragmatic trade-off: types accept the shim, runtime works correctly.
 */

export type SupabaseClient = RealSupabaseClient;

function shouldUseAwsDb(): boolean {
  return process.env.ENABLE_AWS_DB === 'true';
}

function getUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  if (shouldUseAwsDb()) {
    _supabase = getPgShim() as unknown as SupabaseClient;
  } else {
    const url = getUrl();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export function getServiceClient(): SupabaseClient {
  if (shouldUseAwsDb()) {
    return getPgShim() as unknown as SupabaseClient;
  }
  const url = getUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, serviceRoleKey);
}

/**
 * Returns true when database config is present for whichever backend
 * is selected. Used by `isDemoMode()` to decide between live vs demo data.
 */
export function hasSupabaseConfig(): boolean {
  if (shouldUseAwsDb()) {
    return !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_PASSWORD));
  }
  return !!(getUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

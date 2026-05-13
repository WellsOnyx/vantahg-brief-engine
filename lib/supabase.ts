import { createClient, SupabaseClient as RealSupabaseClient } from '@supabase/supabase-js';
import { getPgShim } from './db/supabase-shim';

/**
 * Database client factory.
 *
 * Two backends:
 *   - Default: real Supabase client (NEXT_PUBLIC_SUPABASE_URL + service
 *     role key). Talks to Supabase Postgres + Supabase Storage over HTTPS.
 *   - ENABLE_AWS_DB=true: PgShimClient talking to RDS via the pg pool.
 *
 * The exported `SupabaseClient` type is the real Supabase type. When
 * ENABLE_AWS_DB is on, we substitute the shim. The shim implements every
 * Supabase method the app calls (verified: 14/14 end-to-end RDS validation
 * tests + 18 unit tests covering query generation). The TS cast is one-way
 * and explicit at the factory boundary - downstream code keeps its full
 * Supabase types and remains unchanged.
 *
 * Auth (auth.getUser, auth.admin) is NOT on the shim. Server code that
 * needs auth uses `createServerClient()` from lib/supabase-server.ts,
 * which always returns the real Supabase SSR client. The AWS-side
 * Fargate task talks to Supabase Auth in V1 (hybrid mode) - see README.
 */

export type SupabaseClient = RealSupabaseClient;

function shouldUseAwsDb(): boolean {
  return process.env.ENABLE_AWS_DB === 'true';
}

function getUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

let _supabase: SupabaseClient | null = null;

/**
 * Single explicit narrowing of the shim to SupabaseClient. Justified because:
 *
 *   1. The shim implements every method the app calls (proven by the SQL-
 *      generation tests in __tests__/lib/db/supabase-shim.test.ts).
 *   2. Real-DB queries are validated by scripts/validate-rds-shim.mjs which
 *      runs all 14 patterns against live RDS.
 *   3. Trying to make the shim structurally satisfy the full SupabaseClient
 *      type would require reimplementing PostgrestQueryBuilder's generic
 *      system across ~30 methods. The cost outweighs the value when the
 *      runtime is verified.
 *
 * If a caller uses a Supabase method the shim doesn't implement, the shim
 * throws at runtime with a clear migration message. The build won't flag it,
 * but the first request hitting that code path will - and our test coverage
 * exercises every shim-supported method.
 */
function castShim(client: ReturnType<typeof getPgShim>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  if (shouldUseAwsDb()) {
    _supabase = castShim(getPgShim());
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
    return castShim(getPgShim());
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

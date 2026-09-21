/**
 * Database target for operator bootstrap / seed scripts.
 *
 * ENABLE_AWS_DB=true → pg shim (lib/db/supabase-shim.ts) against
 * DATABASE_URL or DB_HOST + DB_PASSWORD. Supabase URL keys and
 * Supabase Auth admin are not consulted.
 *
 * Flag off → leftover Supabase JS client. Honest hybrid path.
 */

import type { DbClient } from '@/lib/db/types';
import {
  hasRdsConnectionEnv,
  hasSupabaseConnectionEnv,
  isAwsDbEnabled,
} from '@/lib/runtime-backend';

export type BootstrapDbKind = 'rds' | 'supabase';

export class BootstrapConfigError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = 'BootstrapConfigError';
    this.exitCode = exitCode;
  }
}

export type BootstrapResolution =
  | { ok: true; kind: BootstrapDbKind; summary: string }
  | { ok: false; message: string; exitCode: number };

export function resolveBootstrapDb(env: NodeJS.ProcessEnv = process.env): BootstrapResolution {
  if (env.ENABLE_AWS_DB === 'true' || (env === process.env && isAwsDbEnabled())) {
    const hasConn = env === process.env
      ? hasRdsConnectionEnv()
      : !!(env.DATABASE_URL || (env.DB_HOST && env.DB_PASSWORD));
    if (!hasConn) {
      return {
        ok: false,
        exitCode: 2,
        message: [
          'ENABLE_AWS_DB=true but no Postgres connection is configured.',
          'Set DATABASE_URL, or DB_HOST + DB_PASSWORD (DB_NAME / DB_USER as needed).',
          'This path does not use Supabase URL keys or Supabase Auth admin.',
          'Apply the schema first: npm run db:migrate:rds',
          'Local docker: DATABASE_SSL=disable (or a localhost DATABASE_URL).',
        ].join('\n'),
      };
    }
    return {
      ok: true,
      kind: 'rds',
      summary: 'RDS / plain Postgres via the pg shim (ENABLE_AWS_DB=true). Supabase JS is not used.',
    };
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const hasSupabase = env === process.env
    ? hasSupabaseConnectionEnv()
    : !!(url && serviceKey);
  if (!hasSupabase) {
    return {
      ok: false,
      exitCode: 2,
      message: [
        'No database selected for this script.',
        'RDS: ENABLE_AWS_DB=true plus DATABASE_URL (or DB_HOST + DB_PASSWORD).',
        'Leftover Supabase: leave ENABLE_AWS_DB unset/false and set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) plus SUPABASE_SERVICE_ROLE_KEY.',
      ].join('\n'),
    };
  }

  return {
    ok: true,
    kind: 'supabase',
    summary: 'Supabase JS leftover (ENABLE_AWS_DB is not true). Service role key required; anon key is not used.',
  };
}

/**
 * Host-only label for logs. Never includes user, password, or query string.
 */
export function describeDbTarget(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ENABLE_AWS_DB === 'true') {
    const raw = env.DATABASE_URL;
    if (raw) {
      try {
        const u = new URL(raw);
        const db = u.pathname.replace(/^\//, '') || 'postgres';
        const port = u.port || '5432';
        return `postgres://${u.hostname}:${port}/${db}`;
      } catch {
        return 'postgres (DATABASE_URL set)';
      }
    }
    if (env.DB_HOST) {
      const port = env.DB_PORT || '5432';
      const db = env.DB_NAME || 'vantaum';
      return `postgres://${env.DB_HOST}:${port}/${db}`;
    }
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return 'supabase (URL set)';
    }
  }
  return 'unconfigured';
}

export async function openBootstrapDb(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ kind: BootstrapDbKind; client: DbClient; summary: string }> {
  const resolved = resolveBootstrapDb(env);
  if (!resolved.ok) {
    throw new BootstrapConfigError(resolved.message, resolved.exitCode);
  }
  if (resolved.kind === 'rds') {
    const { getPgShim } = await import('@/lib/db/supabase-shim');
    return { kind: 'rds', client: getPgShim(), summary: resolved.summary };
  }
  const { createClient } = await import('@supabase/supabase-js');
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    kind: 'supabase',
    client: client as unknown as DbClient,
    summary: resolved.summary,
  };
}

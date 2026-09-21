/**
 * Runtime backend selection.
 *
 * Single place operators and health/status surfaces can ask "which vendor
 * is actually in use?" without reading ENABLE_AWS_* flags themselves.
 *
 * Selection rules (mirrors the adapter factories):
 *   - Demo when NEXT_PUBLIC_DEMO_MODE=true or neither Supabase nor RDS
 *     connection info is present.
 *   - Database: ENABLE_AWS_DB=true + RDS env → rds; else supabase if
 *     configured; else demo.
 *   - Storage / email / auth follow ENABLE_AWS_* independently so Vercel
 *     + Supabase can still run during cutover.
 */

export type DbBackend = 'rds' | 'supabase' | 'demo';
export type StorageBackend = 's3' | 'supabase';
export type AuthBackend = 'cognito' | 'supabase';
export type EmailBackend = 'ses' | 'smtp';

export interface RuntimeBackends {
  db: DbBackend;
  storage: StorageBackend;
  auth: AuthBackend;
  email: EmailBackend;
}

function flagOn(name: string): boolean {
  return process.env[name] === 'true';
}

export function isAwsDbEnabled(): boolean {
  return flagOn('ENABLE_AWS_DB');
}

export function isAwsStorageEnabled(): boolean {
  return flagOn('ENABLE_AWS_STORAGE');
}

export function isAwsAuthEnabled(): boolean {
  return flagOn('ENABLE_AWS_AUTH');
}

export function isAwsEmailEnabled(): boolean {
  return flagOn('ENABLE_AWS_EMAIL');
}

export function hasRdsConnectionEnv(): boolean {
  return !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_PASSWORD));
}

export function hasSupabaseConnectionEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return !!(url && service);
}

export function getDbBackend(): DbBackend {
  if (flagOn('NEXT_PUBLIC_DEMO_MODE')) return 'demo';
  if (isAwsDbEnabled() && hasRdsConnectionEnv()) return 'rds';
  if (hasSupabaseConnectionEnv()) return 'supabase';
  return 'demo';
}

export function getStorageBackend(): StorageBackend {
  return isAwsStorageEnabled() ? 's3' : 'supabase';
}

export function getAuthBackend(): AuthBackend {
  return isAwsAuthEnabled() ? 'cognito' : 'supabase';
}

export function getEmailBackend(): EmailBackend {
  return isAwsEmailEnabled() ? 'ses' : 'smtp';
}

export function getRuntimeBackends(): RuntimeBackends {
  return {
    db: getDbBackend(),
    storage: getStorageBackend(),
    auth: getAuthBackend(),
    email: getEmailBackend(),
  };
}

/**
 * Public ingress that is backend-agnostic. Gravity Rail, eFax, and
 * external submit talk HTTP + HMAC; they persist through getServiceClient()
 * (RDS shim or Supabase) and storage/email adapters. Do not add
 * vendor-specific clients in those routes.
 */
export const INTEGRATION_INGRESS = {
  externalSubmit: {
    method: 'POST',
    path: '/api/external/submit',
    auth: 'x-api-key (when EXTERNAL_API_KEYS / VANTAHG_API_KEY set) + x-signature HMAC when EXTERNAL_API_SECRET is set',
  },
  efaxGeneric: {
    method: 'POST',
    path: '/api/intake/efax',
    auth: 'HMAC webhook (EFAX_WEBHOOK_SECRET)',
  },
  efaxPhaxio: {
    method: 'POST',
    path: '/api/intake/efax/phaxio',
    auth: 'Phaxio HMAC (PHAXIO_CALLBACK_TOKEN). Synthetic fax → case-spine immediately.',
  },
  emailIntake: {
    method: 'POST',
    path: '/api/intake/email',
    auth: 'webhook secret',
  },
  gravityRail: {
    client: 'lib/gravity-rails.ts',
    method: 'POST',
    path: '/api/intake/gravity-rail',
    env: ['GRAVITY_RAIL_API_KEY', 'GRAVITY_RAIL_WORKSPACE_ID', 'GRAVITY_RAIL_WEBHOOK_SECRET'],
    notes:
      'Inbound POST /api/intake/gravity-rail creates a case-spine case. HMAC when a webhook secret is set; production with no secret fails closed. Outbound lib/gravity-rails.ts returns 503 when GRAVITY_RAIL_API_KEY is empty (no fake workspace). Not live-keyed.',
  },
} as const;

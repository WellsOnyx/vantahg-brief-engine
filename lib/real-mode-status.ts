/**
 * Real-mode pre-flight check.
 *
 * Tells the operator — at a glance — exactly what's wired up and what isn't
 * when switching from demo to real customer mode. Designed to be:
 *   - Cheap (no LLM calls, no remote round-trips except a single SELECT 1
 *     against Supabase when that's already configured)
 *   - PHI-safe (reports config readiness only; never inspects case data)
 *   - Self-explaining (each component returns a list of missing env vars
 *     and an actionable hint so the UI can render "what to fix next")
 *
 * Used by:
 *   - /api/admin/real-mode-status (returns the JSON envelope)
 *   - The status pill on /admin/usage
 *   - The bootstrap-real-client script (refuses to run if Supabase isn't
 *     ready)
 */

import { getEnv } from './env';
import { isDemoMode as canonicalIsDemoMode } from './demo-mode';
import { hasSupabaseConfig, getServiceClient } from './supabase';
import {
  getAuthBackend,
  getDbBackend,
  getEmailBackend,
  getStorageBackend,
  hasRdsConnectionEnv,
} from './runtime-backend';

export type ComponentReady = 'ready' | 'missing' | 'demo';

export interface ComponentStatus {
  status: ComponentReady;
  /** Env var names that need to be set, in the order they should be filled. */
  missing: string[];
  /** Short, actionable hint for the operator. Stable across versions. */
  hint: string;
}

export interface RealModeStatus {
  demo_mode: boolean;
  overall: 'demo' | 'partial' | 'ready';
  components: {
    supabase: ComponentStatus;
    storage: ComponentStatus;
    auth: ComponentStatus;
    email: ComponentStatus;
    anthropic: ComponentStatus;
    cron: ComponentStatus;
    efax: ComponentStatus;
    ocr: ComponentStatus;
    sentry: ComponentStatus;
    hellosign: ComponentStatus;
    migrations: ComponentStatus;
  };
  generated_at: string;
}

/**
 * Checks the canonical Phase 1 / 2 tables exist in the database. Cheap —
 * single information_schema query. If Supabase is unreachable we surface
 * 'missing' with a hint to fix Supabase first.
 */
async function probeRequiredTables(): Promise<{ ok: boolean; missing: string[] }> {
  // Tables introduced by migrations 010–014. If any are absent, the signup
  // → contract → e-sign loop won't function.
  const required = ['signup_requests', 'contracts', 'contract_templates'];
  try {
    const supabase = getServiceClient();
    const missing: string[] = [];
    for (const t of required) {
      const { error } = await supabase.from(t).select('*', { count: 'exact', head: true }).limit(1);
      // PGRST205/42P01-ish errors mean the table doesn't exist.
      if (error && /relation .* does not exist|not found in the schema|PGRST205/i.test(error.message)) {
        missing.push(t);
      }
    }
    return { ok: missing.length === 0, missing };
  } catch {
    return { ok: false, missing: required };
  }
}

/**
 * Liveness check against Supabase. Returns true if a no-op query succeeds.
 * Caller is expected to have verified hasSupabaseConfig() first.
 */
async function pingSupabase(): Promise<boolean> {
  try {
    const supabase = getServiceClient();
    // count(*) head:true is the cheapest possible round-trip — no rows, no
    // body parsing, just a 200/4xx.
    const { error } = await supabase.from('cases').select('id', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
}

export async function getRealModeStatus(): Promise<RealModeStatus> {
  const env = getEnv();
  const demo = canonicalIsDemoMode();

  // ── Database (RDS preferred; Supabase still valid during cutover) ──
  const dbBackend = getDbBackend();
  let supabaseStatus: ComponentStatus;
  if (dbBackend === 'rds') {
    const rdsMissing: string[] = [];
    if (!hasRdsConnectionEnv()) {
      rdsMissing.push('DATABASE_URL (or DB_HOST+DB_PASSWORD)');
    }
    if (rdsMissing.length === 0 && hasSupabaseConfig()) {
      const reachable = await pingSupabase();
      supabaseStatus = reachable
        ? { status: 'ready', missing: [], hint: 'RDS via pg shim (ENABLE_AWS_DB).' }
        : {
            status: 'missing',
            missing: [],
            hint: 'ENABLE_AWS_DB is on but a test query failed. Check DATABASE_URL / DB_* and that the schema has been applied (node scripts/apply-rds-migrations.mjs).',
          };
    } else {
      supabaseStatus = {
        status: 'missing',
        missing: rdsMissing,
        hint: 'Set ENABLE_AWS_DB=true and DATABASE_URL (or DB_HOST+DB_PASSWORD from Secrets Manager).',
      };
    }
  } else {
    const supabaseMissing: string[] = [];
    if (!env.NEXT_PUBLIC_SUPABASE_URL) supabaseMissing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) supabaseMissing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) supabaseMissing.push('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseMissing.length === 0 && hasSupabaseConfig()) {
      const reachable = await pingSupabase();
      supabaseStatus = reachable
        ? { status: 'ready', missing: [], hint: 'Connected to Supabase Postgres (cutover leftover).' }
        : {
            status: 'missing',
            missing: [],
            hint:
              'Env vars are set but a test query failed. Check the service role key matches the project URL and that RLS / network rules allow it.',
          };
    } else {
      supabaseStatus = {
        status: demo ? 'demo' : 'missing',
        missing: supabaseMissing,
        hint: demo
          ? 'Demo mode — no database. For AWS: ENABLE_AWS_DB=true + DATABASE_URL. For leftover Vercel: set the three Supabase keys.'
          : 'Set ENABLE_AWS_DB=true + DATABASE_URL, or the three Supabase keys during cutover.',
      };
    }
  }

  const storageBackend = getStorageBackend();
  const storageStatus: ComponentStatus =
    storageBackend === 's3'
      ? {
          status: 'ready',
          missing: [],
          hint: 'S3StorageAdapter (ENABLE_AWS_STORAGE). Buckets vantaum-<env>-{signup-contracts,efax-documents,public-assets}.',
        }
      : {
          status: demo ? 'demo' : 'ready',
          missing: [],
          hint: 'Supabase Storage (cutover leftover). Flip ENABLE_AWS_STORAGE=true for S3.',
        };

  const authBackend = getAuthBackend();
  const authStatus: ComponentStatus =
    authBackend === 'cognito'
      ? process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID
        ? { status: 'ready', missing: [], hint: 'CognitoAuthAdapter. Staged — confirm magic-link Lambdas before relying on this in prod.' }
        : {
            status: 'missing',
            missing: ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'],
            hint: 'ENABLE_AWS_AUTH is on but Cognito ids are missing.',
          }
      : {
          status: demo ? 'demo' : 'ready',
          missing: [],
          hint: 'Supabase Auth (V1 hybrid). Cognito pool + Lambdas are deployed but not cut over. Do not set ENABLE_AWS_AUTH until that wave.',
        };

  const emailBackend = getEmailBackend();
  const emailMissing: string[] = [];
  if (emailBackend === 'ses' && !process.env.SES_FROM_ADDRESS && !process.env.SMTP_FROM) {
    emailMissing.push('SES_FROM_ADDRESS');
  }
  const emailStatus: ComponentStatus =
    emailBackend === 'ses'
      ? emailMissing.length === 0
        ? { status: 'ready', missing: [], hint: 'SesEmailAdapter. Domain must be SES-verified before real mail leaves.' }
        : {
            status: 'missing',
            missing: emailMissing,
            hint: 'ENABLE_AWS_EMAIL is on. Set SES_FROM_ADDRESS to a verified identity.',
          }
      : {
          status: process.env.SMTP_HOST ? 'ready' : demo ? 'demo' : 'missing',
          missing: process.env.SMTP_HOST ? [] : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
          hint: 'SMTP adapter (works with SES SMTP). Or set ENABLE_AWS_EMAIL=true for the SES SDK.',
        };

  // ── Anthropic ────────────────────────────────────────────────────────
  // Real Anthropic requires BOTH the key AND the explicit opt-in flag.
  // See lib/env.ts → isRealAnthropicEnabled for the contract.
  const anthropicMissing: string[] = [];
  if (!env.ANTHROPIC_API_KEY) anthropicMissing.push('ANTHROPIC_API_KEY');
  if (!env.ENABLE_REAL_ANTHROPIC) anthropicMissing.push('ENABLE_REAL_ANTHROPIC=true');

  const anthropicStatus: ComponentStatus = demo
    ? {
        status: 'demo',
        missing: anthropicMissing,
        hint: 'Demo mode is active — real Anthropic calls are gated off. Set ENABLE_REAL_ANTHROPIC=true and provide the key to switch.',
      }
    : anthropicMissing.length === 0
      ? { status: 'ready', missing: [], hint: 'Real Anthropic calls enabled. Token usage will appear on /admin/usage.' }
      : {
          status: 'missing',
          missing: anthropicMissing,
          hint:
            anthropicMissing.includes('ANTHROPIC_API_KEY')
              ? 'Provide an Anthropic API key from the Console.'
              : 'Key is set but ENABLE_REAL_ANTHROPIC is off — flip it to true to allow real calls.',
        };

  // ── Cron secret ──────────────────────────────────────────────────────
  const cronStatus: ComponentStatus = demo
    ? {
        status: 'demo',
        missing: env.CRON_SECRET ? [] : ['CRON_SECRET'],
        hint: 'Demo mode: cron endpoints accept unauthenticated calls for local development.',
      }
    : env.CRON_SECRET
      ? { status: 'ready', missing: [], hint: 'Cron endpoints require Bearer CRON_SECRET.' }
      : {
          status: 'missing',
          missing: ['CRON_SECRET'],
          hint: 'Generate a long random token and set CRON_SECRET. Vercel cron headers must match.',
        };

  // ── eFax (Phaxio) ────────────────────────────────────────────────────
  // These env vars aren't in lib/env.ts's zod schema (kept minimal there);
  // we read them directly. Missing eFax config is non-fatal — only eFax
  // intake stops working.
  const efaxKey = process.env.PHAXIO_API_KEY;
  const efaxSecret = process.env.PHAXIO_API_SECRET;
  const efaxCallback = process.env.PHAXIO_CALLBACK_TOKEN;
  const efaxMissing: string[] = [];
  if (!efaxKey) efaxMissing.push('PHAXIO_API_KEY');
  if (!efaxSecret) efaxMissing.push('PHAXIO_API_SECRET');
  if (!efaxCallback) efaxMissing.push('PHAXIO_CALLBACK_TOKEN');

  const efaxStatus: ComponentStatus =
    efaxMissing.length === 0
      ? { status: 'ready', missing: [], hint: 'Phaxio webhook + media download credentials present.' }
      : {
          status: 'missing',
          missing: efaxMissing,
          hint: 'eFax intake will not work until all three Phaxio credentials are present. Email + portal intake still work.',
        };

  // ── OCR (Google Vision) ──────────────────────────────────────────────
  const visionKey = process.env.GOOGLE_VISION_API_KEY;
  const ocrStatus: ComponentStatus = visionKey
    ? { status: 'ready', missing: [], hint: 'Google Vision OCR active for eFax document extraction.' }
    : {
        status: 'missing',
        missing: ['GOOGLE_VISION_API_KEY'],
        hint: 'Without OCR, the eFax worker falls back to provider-native or demo extraction.',
      };

  // ── Sentry (optional) ────────────────────────────────────────────────
  const sentryStatus: ComponentStatus = env.SENTRY_DSN
    ? { status: 'ready', missing: [], hint: 'Errors reported to Sentry.' }
    : {
        status: 'missing',
        missing: ['SENTRY_DSN'],
        hint: 'Optional. Without Sentry, errors only appear in Vercel logs + the audit_log table.',
      };

  // ── Dropbox Sign (formerly HelloSign) ────────────────────────────────
  const hellosignMissing: string[] = [];
  if (!env.HELLOSIGN_API_KEY) hellosignMissing.push('HELLOSIGN_API_KEY');
  if (!env.HELLOSIGN_CLIENT_ID) hellosignMissing.push('HELLOSIGN_CLIENT_ID');
  if (!env.ENABLE_REAL_HELLOSIGN) hellosignMissing.push('ENABLE_REAL_HELLOSIGN=true');

  const hellosignStatus: ComponentStatus = demo
    ? {
        status: 'demo',
        missing: hellosignMissing,
        hint:
          'Demo mode: contract send-for-signature returns a stub envelope id. Set ENABLE_REAL_HELLOSIGN=true and provide both API key + client ID to switch.',
      }
    : hellosignMissing.length === 0
      ? {
          status: 'ready',
          missing: [],
          hint:
            'Real Dropbox Sign enabled. Confirm webhook URL is configured at https://app.hellosign.com → API → App: https://vantaum.com/api/webhooks/hellosign',
        }
      : {
          status: 'missing',
          missing: hellosignMissing,
          hint:
            hellosignMissing.includes('HELLOSIGN_API_KEY')
              ? 'Provide HELLOSIGN_API_KEY from app.hellosign.com → API.'
              : hellosignMissing.includes('HELLOSIGN_CLIENT_ID')
                ? 'Provide HELLOSIGN_CLIENT_ID (App ID) — required for webhook HMAC verification.'
                : 'Keys set but ENABLE_REAL_HELLOSIGN is off — flip it to true to send real signature requests.',
        };

  // ── Migrations (Phase 1 + 2 tables) ──────────────────────────────────
  let migrationsStatus: ComponentStatus;
  if (supabaseStatus.status !== 'ready') {
    migrationsStatus = {
      status: 'missing',
      missing: [],
      hint: 'Fix the database connection first (ENABLE_AWS_DB + DATABASE_URL, or leftover Supabase keys) — migrations can\'t be probed without it.',
    };
  } else {
    const probe = await probeRequiredTables();
    migrationsStatus = probe.ok
      ? {
          status: 'ready',
          missing: [],
          hint: 'signup_requests, contracts, and contract_templates tables present.',
        }
      : {
          status: 'missing',
          missing: probe.missing,
          hint:
            'Apply the RDS plan (`node scripts/apply-rds-migrations.mjs`) or `supabase db push` during cutover. Signup → contract → e-sign needs these tables.',
        };
  }

  // ── Overall ──────────────────────────────────────────────────────────
  let overall: RealModeStatus['overall'];
  if (demo) {
    overall = 'demo';
  } else if (
    supabaseStatus.status === 'ready' &&
    anthropicStatus.status === 'ready' &&
    cronStatus.status === 'ready' &&
    migrationsStatus.status === 'ready'
  ) {
    overall = 'ready';
  } else {
    overall = 'partial';
  }

  return {
    demo_mode: demo,
    overall,
    components: {
      supabase: supabaseStatus,
      storage: storageStatus,
      auth: authStatus,
      email: emailStatus,
      anthropic: anthropicStatus,
      cron: cronStatus,
      efax: efaxStatus,
      ocr: ocrStatus,
      sentry: sentryStatus,
      hellosign: hellosignStatus,
      migrations: migrationsStatus,
    },
    generated_at: new Date().toISOString(),
  };
}

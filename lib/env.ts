import { z } from 'zod';
import { isDemoMode as canonicalIsDemoMode } from './demo-mode';

/**
 * Centralized environment configuration.
 *
 * Design choices:
 * - **Lazy validation.** `getEnv()` is memoized on first call. The module
 *   does NOT call `getEnv()` at import time, because doing so would crash
 *   the build any time a `process.env.X` is missing — including the very
 *   demo-mode setup the rest of the codebase is designed to handle.
 * - **Required-in-real-mode, optional-in-schema.** Sensitive vars are marked
 *   `.optional()` here so the schema parses cleanly without them. The typed
 *   helpers below (`isRealAnthropicEnabled`, `requireCronSecret`, …) decide
 *   whether the absence is a problem.
 * - **Single source of truth for demo mode.** `isDemoMode` is re-exported
 *   from `lib/demo-mode.ts`, the canonical implementation imported by every
 *   caller in the codebase. Two `isDemoMode()` functions with divergent
 *   truth tables is the classic "works on my machine, leaks PHI in prod"
 *   bug — we deliberately avoid it.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Security / Cron
  CRON_SECRET: z.string().min(1).optional(),

  // Demo / feature flags
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  ENABLE_REAL_ANTHROPIC: z.coerce.boolean().default(false),
  ENABLE_REAL_EFAX: z.coerce.boolean().default(false),

  // Service-specific tuning (also read by lib/llm/config.ts)
  LLM_PROVIDER: z.enum(['anthropic', 'bedrock']).optional(),
  LLM_MODEL: z.string().optional(),

  // Optional prod tools
  SENTRY_DSN: z.string().url().optional(),

  // Dropbox Sign (formerly HelloSign) — e-signature for contracts.
  // The API key still uses the legacy HELLOSIGN_ prefix in the SDK and
  // Vercel env, so we keep the same name here.
  HELLOSIGN_API_KEY: z.string().min(1).optional(),
  // Client ID is required only when using embedded signing or webhook
  // signature verification. We use the webhook flow, so it's required
  // in real mode.
  HELLOSIGN_CLIENT_ID: z.string().min(1).optional(),
  // Test mode flag — explicit opt-in just like ENABLE_REAL_ANTHROPIC so
  // production stays on test signatures until we deliberately flip it.
  // Test signatures are free + non-binding; they're indistinguishable
  // from real ones in the API surface, just marked test in Dropbox Sign.
  ENABLE_REAL_HELLOSIGN: z.coerce.boolean().default(false),

  // Meow — B2B banking + invoicing.
  // API key from Meow dashboard. Auth via x-api-key header.
  // ENTITY_ID is optional (multi-entity accounts only); we pass it
  // when present.
  // COLLECTION_ACCOUNT_ID identifies the Meow account that invoice
  // payments deposit into — get from Meow's `/billing/collection-accounts`
  // and treat as configuration.
  // VANTAUM_PRODUCT_ID is the Meow Product representing "VantaUM PEPM";
  // we create it once via script then cache the UUID here so every
  // invoice line item references the same product.
  MEOW_API_KEY: z.string().min(1).optional(),
  MEOW_ENTITY_ID: z.string().min(1).optional(),
  MEOW_COLLECTION_ACCOUNT_ID: z.string().uuid().optional(),
  MEOW_VANTAUM_PRODUCT_ID: z.string().uuid().optional(),
  ENABLE_REAL_MEOW: z.coerce.boolean().default(false),

  // Synthetic stress harness (for calibration only) and labor metric (MVP env only)
  ENABLE_SYNTHETIC_STRESS: z.coerce.boolean().default(false),
  ENABLE_LABOR_METRIC: z.coerce.boolean().default(false),

  // Gravity Rail (external AI platform for operator copilot + voice/sms intake)
  GRAVITY_RAIL_API_KEY: z.string().min(1).optional(),
  GRAVITY_RAIL_WORKSPACE_ID: z.string().min(1).optional(),
  GRAVITY_RAIL_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
let cachedErrorReported = false;

export function getEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    if (!cachedErrorReported) {
      console.error('[env] invalid environment configuration:', result.error.format());
      cachedErrorReported = true;
    }
    // Fall back to schema defaults so an unrelated downstream import doesn't
    // crash the build. Callers that NEED a specific var go through one of
    // the helpers below, which throw with a clear message.
    cached = EnvSchema.parse({});
    return cached;
  }
  cached = result.data;
  return cached;
}

// Canonical demo-mode check. See header comment.
export { isDemoMode } from './demo-mode';

export function isRealAnthropicEnabled(): boolean {
  if (canonicalIsDemoMode()) return false;
  const env = getEnv();
  // ENABLE_REAL_ANTHROPIC is an explicit opt-in. Even with a key set, real
  // calls stay disabled until ENABLE_REAL_ANTHROPIC=true. This is defensive
  // — staging environments that ship with the key but want demo behavior
  // can stay on demo without removing the key.
  return env.ENABLE_REAL_ANTHROPIC && !!env.ANTHROPIC_API_KEY;
}

export function getAnthropicKey(): string {
  if (!isRealAnthropicEnabled()) {
    throw new Error(
      'Real Anthropic calls are disabled. Check isDemoMode(), ANTHROPIC_API_KEY, and ENABLE_REAL_ANTHROPIC.',
    );
  }
  return getEnv().ANTHROPIC_API_KEY!;
}

export function isRealCronEnabled(): boolean {
  if (canonicalIsDemoMode()) return false;
  return !!getEnv().CRON_SECRET;
}

export function isRealHelloSignEnabled(): boolean {
  if (canonicalIsDemoMode()) return false;
  const env = getEnv();
  return env.ENABLE_REAL_HELLOSIGN && !!env.HELLOSIGN_API_KEY && !!env.HELLOSIGN_CLIENT_ID;
}

export function getHelloSignConfig(): { apiKey: string; clientId: string; testMode: boolean } {
  if (!isRealHelloSignEnabled()) {
    throw new Error(
      'Real HelloSign calls are disabled. Check isDemoMode(), HELLOSIGN_API_KEY, HELLOSIGN_CLIENT_ID, and ENABLE_REAL_HELLOSIGN.',
    );
  }
  const env = getEnv();
  return {
    apiKey: env.HELLOSIGN_API_KEY!,
    clientId: env.HELLOSIGN_CLIENT_ID!,
    testMode: env.NODE_ENV !== 'production',
  };
}

export interface MeowConfig {
  apiKey: string;
  entityId: string | null;
  collectionAccountId: string;
  vantaumProductId: string | null;
  baseUrl: string;
}

/**
 * Real Meow calls require the API key, the collection account ID
 * (where invoice payments deposit), and the opt-in flag. Product ID
 * is filled in after first-run bootstrap (see scripts/bootstrap-meow-product.ts)
 * so it's optional at the type level but checked at create-invoice time.
 */
export function isRealMeowEnabled(): boolean {
  if (canonicalIsDemoMode()) return false;
  const env = getEnv();
  return env.ENABLE_REAL_MEOW && !!env.MEOW_API_KEY && !!env.MEOW_COLLECTION_ACCOUNT_ID;
}

export function getMeowConfig(): MeowConfig {
  if (!isRealMeowEnabled()) {
    throw new Error(
      'Real Meow calls are disabled. Check isDemoMode(), MEOW_API_KEY, MEOW_COLLECTION_ACCOUNT_ID, and ENABLE_REAL_MEOW.',
    );
  }
  const env = getEnv();
  return {
    apiKey: env.MEOW_API_KEY!,
    entityId: env.MEOW_ENTITY_ID ?? null,
    collectionAccountId: env.MEOW_COLLECTION_ACCOUNT_ID!,
    vantaumProductId: env.MEOW_VANTAUM_PRODUCT_ID ?? null,
    baseUrl: 'https://api.meow.com/v1',
  };
}

/**
 * Hard guard for cron endpoints. Demo mode is a no-op (so local `curl`
 * workflows work without auth). Production REQUIRES `CRON_SECRET` to be set
 * AND the request header to match — there is no "silent allow" path.
 *
 * Throws on failure. Callers should catch and return 401 (see both cron
 * route handlers for the pattern).
 */
export function requireCronSecret(authorizationHeader: string | null | undefined): void {
  if (canonicalIsDemoMode()) return;
  const expected = getEnv().CRON_SECRET;
  if (!expected) {
    throw new Error('CRON_SECRET must be set in production');
  }
  if (authorizationHeader !== `Bearer ${expected}`) {
    throw new Error('Invalid CRON_SECRET');
  }
}

export function isSyntheticStressEnabled(): boolean {
  const env = getEnv();
  return env.ENABLE_SYNTHETIC_STRESS === true;
}

export function isLaborMetricEnabled(): boolean {
  const env = getEnv();
  return env.ENABLE_LABOR_METRIC === true;
}

export function getGravityRailConfig() {
  const env = getEnv();
  return {
    apiKey: env.GRAVITY_RAIL_API_KEY,
    workspaceId: env.GRAVITY_RAIL_WORKSPACE_ID,
    webhookSecret: env.GRAVITY_RAIL_WEBHOOK_SECRET,
  };
}

export function isGravityRailEnabled(): boolean {
  const { apiKey } = getGravityRailConfig();
  return !!apiKey;
}

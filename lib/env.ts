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

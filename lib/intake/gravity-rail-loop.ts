/**
 * Gravity Rail loop seams on the Phase 2 case-spine intake path.
 *
 * Code-complete and synthetic-safe. Not live-keyed and not production-ready:
 * Cole/Jonah own the real workspace, phone numbers, and API key. This module
 * does not call the Gravity Rail HTTP API.
 *
 * Inbound stays on POST /api/intake/gravity-rail → ingestToCaseSpine.
 * There is no parallel /api/gr/webhook case writer.
 */

import { verifyBodyHmacSha256 } from '@/lib/intake/hmac';

const WEBHOOK_SECRET_ENVS = [
  'GRAVITY_RAIL_WEBHOOK_SECRET',
  'GR_WEBHOOK_SECRET',
  'GR_WEBHOOK_SECRET_SECONDARY',
] as const;

export function gravityRailWebhookSecrets(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const seen = new Set<string>();
  const secrets: string[] = [];
  for (const name of WEBHOOK_SECRET_ENVS) {
    const value = env[name]?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    secrets.push(value);
  }
  return secrets;
}

export type GravityRailWebhookVerdict =
  | { ok: true; unverifiedDev: boolean }
  | { ok: false; status: 401 | 500; reason: string; auditAction: string };

/**
 * Production with no webhook secret fails closed.
 * Dev/test with no secret stays on the synthetic allow path.
 * When any secret is set, the raw body must match HMAC-SHA256
 * (primary, GR_WEBHOOK_SECRET alias, or the rotation secondary).
 */
export function verifyGravityRailWebhook(input: {
  rawBody: string;
  signature: string | null;
  env?: NodeJS.ProcessEnv;
}): GravityRailWebhookVerdict {
  const env = input.env ?? process.env;
  const secrets = gravityRailWebhookSecrets(env);
  if (secrets.length === 0) {
    if (env.NODE_ENV === 'production') {
      return {
        ok: false,
        status: 500,
        reason: 'webhook_secret_not_configured',
        auditAction: 'security:gravity_rail_webhook_secret_missing',
      };
    }
    return { ok: true, unverifiedDev: true };
  }

  let reason = 'signature_mismatch';
  for (const secret of secrets) {
    const verify = verifyBodyHmacSha256({
      rawBody: input.rawBody,
      signature: input.signature,
      secret,
    });
    if (verify.valid) return { ok: true, unverifiedDev: false };
    if (verify.reason) reason = verify.reason;
  }

  return {
    ok: false,
    status: 401,
    reason,
    auditAction: 'security:gravity_rail_invalid_signature',
  };
}

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Idempotency-Key header wins, then chat_id, then external_id.
 * The chosen value is stored as the spine external_id so a replay
 * returns the same case.
 */
export function resolveGravityRailIdempotencyKey(
  headers: { get(name: string): string | null },
  bodies: Array<Record<string, unknown>>,
): string | null {
  const header = headers.get('idempotency-key')?.trim();
  if (header) return header;

  for (const body of bodies) {
    const chatId = asId(body.chat_id);
    if (chatId) return chatId;
  }

  for (const body of bodies) {
    const externalId = asId(body.external_id) ?? asId(body.externalId);
    if (externalId) return externalId;
  }

  return null;
}

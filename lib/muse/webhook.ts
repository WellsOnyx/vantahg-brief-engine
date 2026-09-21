/**
 * Inbound Muse webhook HMAC.
 *
 * Same fail-closed rule as Gravity Rail (`lib/intake/gravity-rail-loop.ts`):
 * production with every webhook secret unset returns
 * `webhook_secret_not_configured`. Dev/test with an empty secret still
 * accepts synthetic relationship payloads. A set secret requires raw-body
 * HMAC-SHA256 (primary or the rotation secondary).
 *
 * This module does not read MUSE_API_KEY and does not call Muse.
 */

import { verifyBodyHmacSha256 } from '@/lib/intake/hmac';
import { museWebhookSecrets } from './config';

export type MuseWebhookVerdict =
  | { ok: true; unverifiedDev: boolean }
  | { ok: false; status: 401 | 500; reason: string; auditAction: string };

export function verifyMuseWebhook(input: {
  rawBody: string;
  signature: string | null;
  env?: NodeJS.ProcessEnv;
}): MuseWebhookVerdict {
  const env = input.env ?? process.env;
  const secrets = museWebhookSecrets(env);
  if (secrets.length === 0) {
    if (env.NODE_ENV === 'production') {
      return {
        ok: false,
        status: 500,
        reason: 'webhook_secret_not_configured',
        auditAction: 'security:muse_webhook_secret_missing',
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
    auditAction: 'security:muse_invalid_signature',
  };
}

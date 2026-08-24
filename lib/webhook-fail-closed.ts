import { NextResponse } from 'next/server';
import { isLocalDemoRuntime } from './runtime-guard';

/**
 * Webhooks fail closed when the shared secret is unset — except local/dev
 * demo, where unsigned intake is still useful for DX.
 *
 * Returns a 401 Response when the request must be rejected, or null when
 * the caller may proceed (local demo with no secret, or secret present
 * and matching).
 */
export function rejectIfWebhookSecretMissing(
  secret: string | undefined | null,
): NextResponse | null {
  if (secret && secret.length > 0) return null;
  if (isLocalDemoRuntime()) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Compare a presented secret (raw, Bearer, or sha256= hex) to the
 * configured value. Local demo with no configured secret is allowed.
 */
export function webhookSecretMatches(
  configured: string | undefined | null,
  presented: string | undefined | null,
): boolean {
  if (!configured) return isLocalDemoRuntime();
  if (!presented) return false;
  if (presented === configured) return true;
  if (presented === `Bearer ${configured}`) return true;
  return false;
}

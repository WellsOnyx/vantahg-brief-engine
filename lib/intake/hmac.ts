/**
 * Shared HMAC-SHA256 verification for intake ingress.
 *
 * Slots only — no vendor credentials are shipped. When the secret env var
 * is unset, callers get `{ valid: true, reason: 'no_secret_configured' }`
 * so synthetic / demo traffic works. When a secret IS set, the signature
 * is required and compared with crypto.timingSafeEqual.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface HmacVerifyInput {
  rawBody: string;
  signature: string | null | undefined;
  secret: string | null | undefined;
  /** Optional prefix on the header value, e.g. `sha256=`. */
  prefix?: string;
}

export interface HmacVerifyResult {
  valid: boolean;
  reason?:
    | 'no_secret_configured'
    | 'missing_signature'
    | 'signature_length_mismatch'
    | 'signature_mismatch';
}

function normalizeProvided(signature: string, prefix?: string): string {
  const trimmed = signature.trim();
  if (prefix && trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length);
  }
  if (trimmed.toLowerCase().startsWith('sha256=')) {
    return trimmed.slice('sha256='.length);
  }
  return trimmed;
}

export function signBodyHmacSha256(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifyBodyHmacSha256(input: HmacVerifyInput): HmacVerifyResult {
  const secret = input.secret?.trim();
  if (!secret) {
    return { valid: true, reason: 'no_secret_configured' };
  }

  if (!input.signature) {
    return { valid: false, reason: 'missing_signature' };
  }

  const provided = normalizeProvided(input.signature, input.prefix).toLowerCase();
  const expected = signBodyHmacSha256(input.rawBody ?? '', secret).toLowerCase();

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'signature_length_mismatch' };
  }

  return timingSafeEqual(providedBuf, expectedBuf)
    ? { valid: true }
    : { valid: false, reason: 'signature_mismatch' };
}

export function firstSignatureHeader(
  headers: { get(name: string): string | null },
  names: string[],
): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }
  return null;
}

/**
 * HMAC-signed determination.signed webhook payload (05).
 *
 * Signature is HMAC-SHA256 of the canonical unsigned JSON (no `signature`
 * field). The posted body includes `signature`. Header:
 *   X-VantaUM-Signature: sha256=<hex>
 */

import { signBodyHmacSha256, verifyBodyHmacSha256 } from '@/lib/intake/hmac';
import type { CmFlag, SpineDetermination, SlaStatus, AuthWorkflowType } from '@/lib/case-spine/types';

export const DETERMINATION_SIGNED_EVENT = 'determination.signed' as const;

export interface DeterminationSignedPayload {
  event: typeof DETERMINATION_SIGNED_EVENT;
  case_id: string;
  external_id: string | null;
  type: AuthWorkflowType;
  determination: SpineDetermination;
  determined_at: string;
  sla_status: SlaStatus;
  download_url: string;
  cm_flags: CmFlag[];
}

export interface SignedDeterminationWebhook {
  payload: DeterminationSignedPayload;
  signed: DeterminationSignedPayload & { signature: string };
  body: string;
  signature: string;
  headers: Record<string, string>;
}

const UNSIGNED_KEYS: Array<keyof DeterminationSignedPayload> = [
  'event',
  'case_id',
  'external_id',
  'type',
  'determination',
  'determined_at',
  'sla_status',
  'download_url',
  'cm_flags',
];

export function canonicalWebhookJson(payload: DeterminationSignedPayload): string {
  const ordered: Record<string, unknown> = {};
  for (const key of UNSIGNED_KEYS) {
    ordered[key] = payload[key];
  }
  return JSON.stringify(ordered);
}

export function buildDeterminationSignedPayload(input: {
  case_id: string;
  external_id?: string | null;
  type: AuthWorkflowType;
  determination: SpineDetermination;
  determined_at: string;
  sla_status: SlaStatus;
  download_url: string;
  cm_flags?: CmFlag[];
}): DeterminationSignedPayload {
  return {
    event: DETERMINATION_SIGNED_EVENT,
    case_id: input.case_id,
    external_id: input.external_id ?? null,
    type: input.type,
    determination: input.determination,
    determined_at: input.determined_at,
    sla_status: input.sla_status,
    download_url: input.download_url,
    cm_flags: input.cm_flags ? [...input.cm_flags] : [],
  };
}

export function signDeterminationWebhook(
  payload: DeterminationSignedPayload,
  secret: string,
): SignedDeterminationWebhook {
  const canonical = canonicalWebhookJson(payload);
  const signature = signBodyHmacSha256(canonical, secret);
  const signed = { ...payload, signature };
  return {
    payload,
    signed,
    body: JSON.stringify(signed),
    signature,
    headers: {
      'content-type': 'application/json',
      'X-VantaUM-Signature': `sha256=${signature}`,
      'X-VantaUM-Event': DETERMINATION_SIGNED_EVENT,
    },
  };
}

export function verifyDeterminationWebhook(input: {
  canonicalBody: string;
  signature: string;
  secret: string;
}): boolean {
  return verifyBodyHmacSha256({
    rawBody: input.canonicalBody,
    signature: input.signature,
    secret: input.secret,
    prefix: 'sha256=',
  }).valid;
}

export function portalPackageUrl(caseId: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/portal/determinations/${caseId}/package`;
}

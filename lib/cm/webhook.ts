/**
 * HMAC-signed cm.handoff payload (09).
 *
 * Same reliability pattern as determination.signed (05 / Phase 4):
 * HMAC-SHA256 of canonical unsigned JSON, X-VantaUM-Signature header.
 */

import { signBodyHmacSha256, verifyBodyHmacSha256 } from '@/lib/intake/hmac';
import type { CmFlag, SpineDetermination } from '@/lib/case-spine/types';

export const CM_HANDOFF_EVENT = 'cm.handoff' as const;

export interface CmHandoffPayload {
  event: typeof CM_HANDOFF_EVENT;
  case_id: string;
  external_id: string | null;
  flags: CmFlag[];
  determination: SpineDetermination;
  determined_at: string;
  secure_summary_url: string;
}

export interface SignedCmHandoffWebhook {
  payload: CmHandoffPayload;
  signed: CmHandoffPayload & { signature: string };
  body: string;
  signature: string;
  headers: Record<string, string>;
}

const UNSIGNED_KEYS: Array<keyof CmHandoffPayload> = [
  'event',
  'case_id',
  'external_id',
  'flags',
  'determination',
  'determined_at',
  'secure_summary_url',
];

export function canonicalCmWebhookJson(payload: CmHandoffPayload): string {
  const ordered: Record<string, unknown> = {};
  for (const key of UNSIGNED_KEYS) {
    ordered[key] = payload[key];
  }
  return JSON.stringify(ordered);
}

export function buildCmHandoffPayload(input: {
  case_id: string;
  external_id?: string | null;
  flags: CmFlag[];
  determination: SpineDetermination;
  determined_at: string;
  secure_summary_url: string;
}): CmHandoffPayload {
  return {
    event: CM_HANDOFF_EVENT,
    case_id: input.case_id,
    external_id: input.external_id ?? null,
    flags: [...input.flags],
    determination: input.determination,
    determined_at: input.determined_at,
    secure_summary_url: input.secure_summary_url,
  };
}

export function signCmHandoffWebhook(payload: CmHandoffPayload, secret: string): SignedCmHandoffWebhook {
  const canonical = canonicalCmWebhookJson(payload);
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
      'X-VantaUM-Event': CM_HANDOFF_EVENT,
    },
  };
}

export function verifyCmHandoffWebhook(input: {
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

export function cmSecureSummaryUrl(caseId: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/portal/determinations/${caseId}/package`;
}

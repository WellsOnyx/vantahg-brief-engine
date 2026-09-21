/**
 * PHI-safe CM handoff log events.
 *
 * Never include webhook body, external_id, secure_summary_url, member_ref,
 * rationale, or other live identifiers. Flag codes are category labels, not PHI.
 */

import { safeLog } from '@/lib/security';
import type { CmFlag } from '@/lib/case-spine/types';
import { CM_HANDOFF_EVENT } from './webhook';

export interface CmHandoffLogEvent {
  event: typeof CM_HANDOFF_EVENT;
  case_id: string;
  flagged: boolean;
  flag_count: number;
  flags: CmFlag[];
  configured: boolean;
  ok: boolean | null;
  attempts: number;
  replayed: boolean;
  last_error: string | null;
}

const PHI_LOG_KEYS = [
  'external_id',
  'secure_summary_url',
  'member_ref',
  'member_id',
  'patient_name',
  'rationale',
  'payload',
  'body',
  'signature',
] as const;

export function sanitizeCmTransportError(error: string | null | undefined): string | null {
  if (!error) return null;
  if (/^http_\d{3}$/.test(error)) return error;
  const stripped = error
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[redacted]');
  return stripped.slice(0, 160);
}

export function summarizeCmHandoffForLog(input: {
  case_id: string;
  flagged: boolean;
  flags?: CmFlag[];
  configured: boolean;
  ok: boolean | null;
  attempts: number;
  replayed?: boolean;
  last_error?: string | null;
}): CmHandoffLogEvent {
  return {
    event: CM_HANDOFF_EVENT,
    case_id: input.case_id,
    flagged: input.flagged,
    flag_count: input.flags?.length ?? 0,
    flags: input.flags ? [...input.flags] : [],
    configured: input.configured,
    ok: input.ok,
    attempts: input.attempts,
    replayed: Boolean(input.replayed),
    last_error: sanitizeCmTransportError(input.last_error),
  };
}

export function assertCmLogHasNoPhi(event: Record<string, unknown>): void {
  for (const key of PHI_LOG_KEYS) {
    if (key in event) {
      throw new Error(`CM log must not include ${key}`);
    }
  }
}

export function emitCmHandoffLog(event: CmHandoffLogEvent): void {
  assertCmLogHasNoPhi(event as unknown as Record<string, unknown>);
  safeLog('[cm.handoff]', event);
}

import type { DeterminationSignedPayload } from './webhook';

export const FANOUT_MAX_ATTEMPTS = 8;

/** Exponential backoff: 1s, 2s, 4s, … 128s. Tests inject a no-op sleeper. */
export const FANOUT_BACKOFF_MS = [1, 2, 4, 8, 16, 32, 64, 128].map((s) => s * 1000);

export const FANOUT_TARGETS = [
  'F1_portal',
  'F2_webhook',
  'F3_fax',
  'F4_email',
  'F5_billing',
  'F6_cm',
  'F7_archive',
] as const;
export type FanoutTarget = (typeof FANOUT_TARGETS)[number];

export const REQUIRED_FANOUT_TARGETS: readonly FanoutTarget[] = ['F1_portal', 'F5_billing'];

export interface FanoutAttempt {
  attempt_id: string;
  case_id: string;
  target: FanoutTarget;
  attempt: number;
  at: string;
  ok: boolean;
  status: number | null;
  error: string | null;
}

export interface CxTask {
  task_id: string;
  case_id: string;
  client_id: string;
  kind: 'resolve_fanout';
  status: 'open' | 'resolved';
  created_at: string;
  note: string;
}

export interface OutboundIntent {
  intent_id: string;
  case_id: string;
  channel: 'email' | 'fax' | 'cm_webhook' | 'archive' | 'portal';
  recorded_at: string;
  status: 'recorded' | 'sent' | 'skipped';
  reason: string;
  to?: string | null;
  subject?: string | null;
}

export interface TargetResult {
  target: FanoutTarget;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  attempts?: number;
}

export interface FanoutResult {
  case_id: string;
  state: string;
  fanout_status: 'pending' | 'complete' | 'failed';
  required_ok: boolean;
  webhook: {
    configured: boolean;
    ok: boolean | null;
    attempts: number;
    last_error: string | null;
    payload?: DeterminationSignedPayload;
    signature?: string;
  };
  targets: TargetResult[];
  billable_event_ids: string[];
  cx_task_id: string | null;
  outbound_intents: OutboundIntent[];
}

export interface WebhookDelivery {
  ok: boolean;
  status: number;
  error?: string;
}

export type WebhookTransport = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<WebhookDelivery>;

export async function defaultWebhookTransport(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<WebhookDelivery> {
  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `http_${res.status}` };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'webhook_transport_failed',
    };
  }
}

export function nextBackoffMs(attemptNumber: number): number {
  const index = Math.max(0, Math.min(attemptNumber - 1, FANOUT_BACKOFF_MS.length - 1));
  return FANOUT_BACKOFF_MS[index];
}

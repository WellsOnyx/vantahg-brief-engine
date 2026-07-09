import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { signIntakeRequest } from '@/lib/intake/gr-contract';

/**
 * Decision-out: partner webhook event queue (docs/PARTNER_API.md §5).
 *
 * When something a partner cares about happens to a case (a determination
 * is recorded, a status changes), we enqueue one delivery row per
 * partner key on that case's client tenant that has a webhook_url.
 * A cron worker drains the queue with the same claim-batch / SKIP LOCKED /
 * exponential-backoff / dead-letter semantics as the eFax pipeline.
 *
 * Outbound requests are signed with the SAME v1.1 recipe partners already
 * verify inbound (HMAC-SHA256 over `${ts}.${body}`), delivered in
 * X-VUM-Signature + X-VUM-Timestamp, keyed by the per-key webhook_secret.
 * One signing recipe on both sides of the wire — nothing new to learn.
 *
 * PHI discipline: event payloads carry case identifiers, status, and the
 * determination outcome — no clinical narrative, no patient demographics
 * beyond what the partner already submitted (they hold the source record).
 */

export type PartnerEventType = 'case.determination' | 'case.status_changed';

export interface PartnerEventPayload {
  event: PartnerEventType;
  api_version: 'v1';
  case_id: string;
  case_number: string | null;
  client_reference: string | null; // the partner's submission/idempotency reference when known
  status: string;
  determination?: {
    decision: string | null;
    decided_at: string | null;
  };
  occurred_at: string;
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 240]; // then dead_letter
export const MAX_DELIVERY_ATTEMPTS = BACKOFF_MINUTES.length;

/**
 * Enqueue an event for every webhook-configured partner key on the case's
 * client. Best-effort and non-throwing — a full outbound queue must never
 * break the clinical write that triggered it.
 */
export async function enqueuePartnerEvent(
  caseId: string,
  eventType: PartnerEventType,
): Promise<{ enqueued: number }> {
  if (isDemoMode()) return { enqueued: 0 };

  try {
    const supabase = getServiceClient();

    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_number, client_id, status, determination, determination_at, external_reference')
      .eq('id', caseId)
      .maybeSingle();
    if (!caseRow || !caseRow.client_id) return { enqueued: 0 };

    const { data: keys } = await supabase
      .from('partner_api_keys')
      .select('id, webhook_url')
      .eq('client_id', caseRow.client_id)
      .eq('active', true);

    const targets = (keys ?? []).filter((k) => !!k.webhook_url);
    if (targets.length === 0) return { enqueued: 0 };

    const payload: PartnerEventPayload = {
      event: eventType,
      api_version: 'v1',
      case_id: caseRow.id as string,
      case_number: (caseRow.case_number as string) ?? null,
      client_reference: (caseRow.external_reference as string | null) ?? null,
      status: caseRow.status as string,
      ...(eventType === 'case.determination'
        ? {
            determination: {
              decision: (caseRow.determination as string | null) ?? null,
              decided_at: (caseRow.determination_at as string | null) ?? null,
            },
          }
        : {}),
      occurred_at: new Date().toISOString(),
    };

    let enqueued = 0;
    for (const key of targets) {
      const { error } = await supabase.from('partner_webhook_deliveries').insert({
        partner_key_id: key.id,
        case_id: caseRow.id,
        event_type: eventType,
        payload,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      });
      if (!error) enqueued += 1;
    }

    if (enqueued > 0) {
      await logAuditEvent(caseId, 'partner_event_enqueued', 'system', {
        event_type: eventType,
        deliveries: enqueued,
      }).catch(() => {});
    }
    return { enqueued };
  } catch {
    // Never let outbound plumbing break the clinical path.
    return { enqueued: 0 };
  }
}

export interface DeliveryRow {
  id: string;
  partner_key_id: string;
  case_id: string;
  event_type: string;
  payload: PartnerEventPayload;
  attempts: number;
}

/**
 * Attempt one delivery. Returns the terminal disposition for the row.
 * 2xx → delivered. Anything else → retry with backoff, dead-letter after
 * MAX_DELIVERY_ATTEMPTS. 4xx from the partner still retries (their side
 * may be misdeployed) but on the same schedule — the dead-letter queue is
 * the operator's signal either way.
 */
export async function deliverPartnerWebhook(row: DeliveryRow): Promise<'delivered' | 'retry' | 'dead_letter'> {
  const supabase = getServiceClient();

  const { data: key } = await supabase
    .from('partner_api_keys')
    .select('id, webhook_url, webhook_secret, active')
    .eq('id', row.partner_key_id)
    .maybeSingle();

  if (!key || !key.active || !key.webhook_url) {
    await finalize(row.id, 'dead_letter', 'partner key inactive or webhook removed');
    return 'dead_letter';
  }

  const rawBody = JSON.stringify(row.payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key.webhook_secret) {
    const { timestamp, signature } = signIntakeRequest(key.webhook_secret as string, rawBody);
    headers['X-VUM-Timestamp'] = timestamp;
    headers['X-VUM-Signature'] = signature;
  }

  let ok = false;
  let errText = '';
  try {
    const res = await fetch(key.webhook_url as string, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    ok = res.ok;
    if (!ok) errText = `HTTP ${res.status}`;
  } catch (err) {
    errText = err instanceof Error ? err.name : 'fetch_failed';
  }

  if (ok) {
    await supabase
      .from('partner_webhook_deliveries')
      .update({ status: 'delivered', delivered_at: new Date().toISOString(), last_error: null })
      .eq('id', row.id);
    await logAuditEvent(row.case_id, 'partner_event_delivered', 'system', {
      event_type: row.event_type,
      attempts: row.attempts + 1,
    }).catch(() => {});
    return 'delivered';
  }

  const attempts = row.attempts + 1;
  if (attempts >= MAX_DELIVERY_ATTEMPTS) {
    await finalize(row.id, 'dead_letter', errText);
    await logAuditEvent(row.case_id, 'partner_event_dead_letter', 'system', {
      event_type: row.event_type,
      attempts,
      last_error: errText,
    }).catch(() => {});
    return 'dead_letter';
  }

  const backoffMin = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  await supabase
    .from('partner_webhook_deliveries')
    .update({
      status: 'pending',
      attempts,
      last_error: errText,
      next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', row.id);
  return 'retry';

  async function finalize(id: string, status: string, err: string) {
    await supabase
      .from('partner_webhook_deliveries')
      .update({ status, last_error: err, locked_at: null, locked_by: null })
      .eq('id', id);
  }
}

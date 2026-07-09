import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireCronSecret } from '@/lib/env';
import { deliverPartnerWebhook, type DeliveryRow } from '@/lib/partner/webhook-out';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/partner-webhooks — outbound partner event worker.
 *
 * Drains partner_webhook_deliveries with the same chassis as the eFax
 * worker: claim a batch via claim_partner_webhook_batch (FOR UPDATE SKIP
 * LOCKED — concurrent workers never double-deliver; crashed workers'
 * claims self-release after 10 min), deliver each with a 10s timeout,
 * exponential backoff on failure (1/5/15/60/240 min), dead-letter after
 * 5 attempts. Bearer CRON_SECRET auth, same as every cron.
 */

const BATCH_SIZE = 25;
const TIME_BUDGET_MS = 45_000;

export async function GET(request: NextRequest) {
  try {
    requireCronSecret(request.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({ demo: true, claimed: 0, delivered: 0 });
  }

  const started = Date.now();
  const workerId = `partner-webhooks-${started}`;
  const supabase = getServiceClient();

  const { data: batch, error } = await supabase.rpc('claim_partner_webhook_batch', {
    worker_id: workerId,
    batch_size: BATCH_SIZE,
  });
  if (error) {
    return NextResponse.json({ error: 'claim_failed', detail: error.message }, { status: 500 });
  }

  const rows = (batch ?? []) as DeliveryRow[];
  let delivered = 0;
  let retried = 0;
  let dead = 0;

  for (const row of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const outcome = await deliverPartnerWebhook(row);
    if (outcome === 'delivered') delivered += 1;
    else if (outcome === 'retry') retried += 1;
    else dead += 1;
  }

  return NextResponse.json({ claimed: rows.length, delivered, retried, dead_lettered: dead });
}

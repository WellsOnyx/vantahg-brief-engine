import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode, requireCronSecret } from '@/lib/env';
import { runSyntheticMonthlyStatementJob } from '@/lib/billing/statement';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

export const dynamic = 'force-dynamic';

/**
 * Monthly statement stub job (Phase 4.4).
 * Groups open ledger events for the synthetic staging client only.
 * Demo is a no-op-auth success so local curls work without CRON_SECRET.
 * Does not mark events invoiced and does not push to Meow / Stripe / QuickBooks.
 */
export async function GET(request: NextRequest) {
  try {
    requireCronSecret(request.headers.get('authorization'));
  } catch {
    if (!isDemoMode()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id') ?? SYNTHETIC_CLIENT_ID;
  if (clientId !== SYNTHETIC_CLIENT_ID) {
    return NextResponse.json({ error: 'statement_stub_synthetic_only' }, { status: 400 });
  }

  const asOfRaw = searchParams.get('as_of');
  const statement = await runSyntheticMonthlyStatementJob({
    as_of: asOfRaw ? new Date(asOfRaw) : undefined,
  });

  return NextResponse.json({
    stub: true,
    client_id: SYNTHETIC_CLIENT_ID,
    statement_id: statement.statement_id,
    event_count: statement.events.length,
    subtotal: statement.subtotal,
    period_start: statement.period_start,
    period_end: statement.period_end,
    demo: isDemoMode(),
  });
}

export const POST = GET;

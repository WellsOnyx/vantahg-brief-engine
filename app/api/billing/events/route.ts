import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { type BillableStatus } from '@/lib/billing/events';
import { getBillableEventLedger } from '@/lib/billing/ledger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id') ?? undefined;
    const status = searchParams.get('status') as BillableStatus | null;
    const caseId = searchParams.get('case_id');

    const ledger = getBillableEventLedger();
    const events = caseId
      ? await ledger.getByCase(caseId)
      : await ledger.list({
          client_id: clientId,
          status: status === 'open' || status === 'invoiced' || status === 'void' ? status : undefined,
        });

    return NextResponse.json({ events, count: events.length });
  } catch (err) {
    return apiError(err, {
      operation: 'list_billable_events',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

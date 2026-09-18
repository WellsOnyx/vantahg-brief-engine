import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getMemoryBillableEventLedger } from '@/lib/billing/events';
import {
  generateMonthlyStatement,
  getMemoryStatementStore,
} from '@/lib/billing/statement';
import { getClientConfigService } from '@/lib/client-config';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const clientId = new URL(request.url).searchParams.get('client_id') ?? undefined;
    const statements = await getMemoryStatementStore().list(clientId);
    return NextResponse.json({ statements });
  } catch (err) {
    return apiError(err, {
      operation: 'list_billing_statements',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const body = (await request.json().catch(() => ({}))) as {
      client_id?: string;
      period_start?: string;
      period_end?: string;
    };

    const clientId = body.client_id || SYNTHETIC_CLIENT_ID;
    const cfg = await getClientConfigService().getLatest(clientId);
    const statement = await generateMonthlyStatement(
      getMemoryBillableEventLedger(),
      getMemoryStatementStore(),
      {
        client_id: clientId,
        client_name: cfg?.config.legal_name,
        period_start: body.period_start,
        period_end: body.period_end,
      },
    );
    return NextResponse.json({ statement }, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'generate_billing_statement',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

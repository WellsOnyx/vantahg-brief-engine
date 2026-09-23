import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getBillableEventLedger } from '@/lib/billing/ledger';
import { periodKeyFromDate, resolvePlatformCensus, upsertMonthlyPlatformLine } from '@/lib/billing/um-platform';
import {
  generateMonthlyStatement,
  getMemoryStatementStore,
} from '@/lib/billing/statement';
import { getClientConfigService } from '@/lib/client-config';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { resolveSpineViewer } from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    const requested = new URL(request.url).searchParams.get('client_id');
    const clientId = viewer.role === 'client' ? viewer.client_id ?? '__no_tenant__' : requested ?? undefined;
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
      lives_in_month?: number | null;
      employees_in_month?: number | null;
      platform_waived?: boolean;
    };

    const viewer = resolveSpineViewer(authResult.user, request);
    const clientId =
      viewer.role === 'client' ? viewer.client_id || SYNTHETIC_CLIENT_ID : body.client_id || SYNTHETIC_CLIENT_ID;
    const cfg = await getClientConfigService().getLatest(clientId);
    const asOf = body.period_end ? new Date(body.period_end) : new Date();
    const census = resolvePlatformCensus({
      livesInMonth: body.lives_in_month,
      employeesInMonth: body.employees_in_month,
      waived: body.platform_waived,
      config: cfg?.config,
    });
    const ledger = getBillableEventLedger();
    await upsertMonthlyPlatformLine(ledger, {
      clientId,
      periodKey: periodKeyFromDate(asOf),
      livesInMonth: census.livesInMonth,
      pmpm: census.pmpm,
      waived: census.waived,
      occurredAt: asOf.toISOString(),
    });
    const statement = await generateMonthlyStatement(ledger, getMemoryStatementStore(), {
      client_id: clientId,
      client_name: cfg?.config.legal_name,
      period_start: body.period_start,
      period_end: body.period_end,
      as_of: asOf,
      lives_in_month: census.livesInMonth,
      employees_in_month: census.employeesInMonth,
      platform_pmpm: census.livesInMonth == null ? null : census.pmpm,
      platform_waived: census.waived,
    });
    return NextResponse.json({ statement }, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'generate_billing_statement',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

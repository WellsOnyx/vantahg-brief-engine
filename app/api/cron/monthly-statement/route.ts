import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode, requireCronSecret } from '@/lib/env';
import { runSyntheticMonthlyStatementJob } from '@/lib/billing/statement';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

export const dynamic = 'force-dynamic';

/**
 * Monthly statement stub job (Phase 4.4).
 * Groups open ledger events for the synthetic staging client only.
 * Posts um_platform when lives_in_month is on the query or the published client_config.
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
  const livesRaw = searchParams.get('lives_in_month');
  const employeesRaw = searchParams.get('employees_in_month');
  const waivedRaw = searchParams.get('platform_waived');
  const lives = parseOptionalCount(livesRaw);
  const employees = parseOptionalCount(employeesRaw);
  if (livesRaw != null && livesRaw !== '' && lives == null) {
    return NextResponse.json({ error: 'lives_in_month must be a non-negative number' }, { status: 400 });
  }
  if (employeesRaw != null && employeesRaw !== '' && employees == null) {
    return NextResponse.json({ error: 'employees_in_month must be a non-negative number' }, { status: 400 });
  }

  const result = await runSyntheticMonthlyStatementJob({
    as_of: asOfRaw ? new Date(asOfRaw) : undefined,
    lives_in_month: lives,
    employees_in_month: employees,
    platform_waived: waivedRaw == null || waivedRaw === '' ? null : waivedRaw === 'true',
  });

  return NextResponse.json({
    stub: true,
    client_id: SYNTHETIC_CLIENT_ID,
    statement_id: result.statement.statement_id,
    event_count: result.statement.events.length,
    subtotal: result.statement.subtotal,
    period_start: result.statement.period_start,
    period_end: result.statement.period_end,
    platform_posted: result.platform_posted,
    lives_in_month: result.lives_in_month,
    employees_in_month: result.employees_in_month,
    platform_waived: result.platform_waived,
    platform_pmpm: result.platform_pmpm,
    demo: isDemoMode(),
  });
}

function parseOptionalCount(raw: string | null): number | null | undefined {
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export const POST = GET;

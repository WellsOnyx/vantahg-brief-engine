import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { ENTITLED_CLIENT_ID } from '@/lib/vhg/catalog';
import { STOPLOSS_DASHBOARD_ROLES, getStoplossDashboard } from '@/lib/vhg/dashboard';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isVhgScoreDemoEnabled()) {
    return NextResponse.json({ error: 'vhg_score_demo_disabled' }, { status: 404 });
  }
  const authResult = await requireRole(request, [...STOPLOSS_DASHBOARD_ROLES]);
  if (authResult instanceof NextResponse) return authResult;
  const clientId = request.nextUrl.searchParams.get('client') || ENTITLED_CLIENT_ID;
  return NextResponse.json(getStoplossDashboard(clientId));
}

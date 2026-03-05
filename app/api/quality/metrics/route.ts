import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getAuditMetrics } from '@/lib/quality-audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const metrics = await getAuditMetrics();

    return NextResponse.json(metrics);
  } catch (err) {
    console.error('Quality metrics error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

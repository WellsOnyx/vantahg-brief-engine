import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';
import { resolveMedReviewPanel } from '@/lib/vhg/portfolio';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isVhgScoreDemoEnabled()) {
    return NextResponse.json({ error: 'vhg_score_demo_disabled' }, { status: 404 });
  }
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const caseId = request.nextUrl.searchParams.get('caseId')?.trim() ?? '';
  if (!caseId) {
    return NextResponse.json({ error: 'case_id_required' }, { status: 400 });
  }
  return NextResponse.json({ panel: resolveMedReviewPanel(caseId) });
}

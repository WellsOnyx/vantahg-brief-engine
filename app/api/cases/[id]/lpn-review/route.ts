import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode } from '@/lib/demo-mode';
import { submitLpnReview } from '@/lib/pod-assignment-engine';
import type { LpnDetermination } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const body = await request.json();

    const { determination, notes, lpn_id } = body as {
      determination: LpnDetermination;
      notes: string;
      lpn_id: string;
    };

    if (!determination || !notes || !lpn_id) {
      return NextResponse.json(
        { error: 'determination, notes, and lpn_id are required' },
        { status: 400 },
      );
    }

    const validDeterminations: LpnDetermination[] = ['criteria_met', 'criteria_not_met', 'unclear', 'escalate_to_rn'];
    if (!validDeterminations.includes(determination)) {
      return NextResponse.json(
        { error: `Invalid determination. Must be one of: ${validDeterminations.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await submitLpnReview(id, lpn_id, determination, notes);

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      newStatus: result.newStatus,
      message: `LPN review submitted. Case moved to ${result.newStatus}.`,
    });
  } catch (err) {
    console.error('LPN review error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

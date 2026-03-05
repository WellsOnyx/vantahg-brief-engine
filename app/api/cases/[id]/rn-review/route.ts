import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode } from '@/lib/demo-mode';
import { submitRnReview } from '@/lib/pod-assignment-engine';
import type { RnDetermination } from '@/lib/types';

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

    const { determination, notes, rn_id } = body as {
      determination: RnDetermination;
      notes: string;
      rn_id: string;
    };

    if (!determination || !notes || !rn_id) {
      return NextResponse.json(
        { error: 'determination, notes, and rn_id are required' },
        { status: 400 },
      );
    }

    const validDeterminations: RnDetermination[] = ['approve', 'escalate_to_md'];
    if (!validDeterminations.includes(determination)) {
      return NextResponse.json(
        { error: `Invalid determination. Must be one of: ${validDeterminations.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await submitRnReview(id, rn_id, determination, notes);

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      newStatus: result.newStatus,
      message: determination === 'approve'
        ? 'RN approved case at nursing level. No physician review needed.'
        : 'Case escalated to physician review.',
    });
  } catch (err) {
    console.error('RN review error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

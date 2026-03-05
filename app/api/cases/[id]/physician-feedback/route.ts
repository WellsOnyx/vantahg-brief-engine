import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[id]/physician-feedback
 *
 * Captures whether the reviewing physician agreed with the AI recommendation.
 * This is the training signal that improves the system over time.
 * Called when a physician makes a determination.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ['admin', 'reviewer']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const body = await request.json();
    const { agreement, notes } = body;

    if (!agreement || !['agree', 'disagree', 'modified'].includes(agreement)) {
      return NextResponse.json(
        { error: 'agreement must be one of: agree, disagree, modified' },
        { status: 400 }
      );
    }

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        case_id: id,
        physician_ai_agreement: agreement,
        message: 'Feedback recorded (demo mode)',
      });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('cases')
      .update({
        physician_ai_agreement: agreement,
        physician_ai_feedback_notes: notes || null,
      })
      .eq('id', id)
      .select('id, case_number, physician_ai_agreement, ai_brief')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log audit event
    const aiRecommendation = data.ai_brief?.ai_recommendation?.recommendation;
    await logAuditEvent(id, 'physician_ai_feedback', body.reviewer_id || 'reviewer', {
      agreement,
      ai_recommendation: aiRecommendation,
      physician_overrode: agreement !== 'agree',
      notes: notes || null,
    });

    return NextResponse.json({
      success: true,
      case_id: id,
      physician_ai_agreement: agreement,
    });
  } catch (err) {
    console.error('Error recording physician feedback:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

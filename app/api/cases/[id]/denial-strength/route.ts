import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import { scoreDenialStrength } from '@/lib/denial-strength';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/[id]/denial-strength
 *
 * Calculates and returns the denial strength score for a case.
 * Should be called before issuing a denial letter to assess appeal risk.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    if (isDemoMode()) {
      const demoCase = getDemoCase(id);
      if (!demoCase) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      const isPreviewDemo = request.nextUrl.searchParams.get('preview') === '1' || request.nextUrl.searchParams.get('preview') === 'true';
      if (!isPreviewDemo && demoCase.determination !== 'deny' && demoCase.determination !== 'partial_approve') {
        return NextResponse.json({ error: 'Case is not a denial — denial strength scoring only applies to denied cases (use ?preview=1 for pre-decision signal)' }, { status: 400 });
      }
      const result = scoreDenialStrength(demoCase);
      return NextResponse.json(result);
    }

    const supabase = getServiceClient();

    const { data: caseData, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return apiError(error, {
        operation: 'score_denial_strength',
        caseId: id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Support pre-determination "preview" scoring for human reviewers (AI signal only — no side effects).
    // Used in DeterminationForm to surface risk *before* the human commits the denial.
    // When ?preview=1, we bypass the determination check and still return full computed signal.
    const isPreview = request.nextUrl.searchParams.get('preview') === '1' || request.nextUrl.searchParams.get('preview') === 'true';

    if (!isPreview && caseData.determination !== 'deny' && caseData.determination !== 'partial_approve') {
      return NextResponse.json(
        { error: 'Case is not a denial — denial strength scoring only applies to denied cases (use ?preview=1 for pre-decision signal)' },
        { status: 400 }
      );
    }

    const result = scoreDenialStrength(caseData);

    // Store the core score/grade (existing columns). Appeal likelihood is a live computed signal (JSONB/audit friendly, no new columns to avoid bloat).
    // Returned in response for immediate human reviewer consumption in determination flows.
    await supabase
      .from('cases')
      .update({
        denial_strength_score: result.score,
        denial_strength_grade: result.grade,
        // Optional: could JSONB-extend internal_notes or ai_brief with full appeal_likelihood later if volume justifies.
      })
      .eq('id', id);

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err, {
      operation: 'score_denial_strength',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

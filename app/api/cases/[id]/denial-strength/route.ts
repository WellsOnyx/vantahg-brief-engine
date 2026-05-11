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
      if (demoCase.determination !== 'deny' && demoCase.determination !== 'partial_approve') {
        return NextResponse.json({ error: 'Case is not a denial — denial strength scoring only applies to denied cases' }, { status: 400 });
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

    if (caseData.determination !== 'deny' && caseData.determination !== 'partial_approve') {
      return NextResponse.json(
        { error: 'Case is not a denial — denial strength scoring only applies to denied cases' },
        { status: 400 }
      );
    }

    const result = scoreDenialStrength(caseData);

    // Store the score on the case
    await supabase
      .from('cases')
      .update({
        denial_strength_score: result.score,
        denial_strength_grade: result.grade,
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

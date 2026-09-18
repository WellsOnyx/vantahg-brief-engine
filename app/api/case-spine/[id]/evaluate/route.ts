import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  CaseNotFoundError,
  getCaseSpineService,
  type RuleEvalContext,
} from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as RuleEvalContext;
    const result = await getCaseSpineService().evaluateCase(id, body, authResult.user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'evaluate_case_spine_rules',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

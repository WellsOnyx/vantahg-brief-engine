import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { CaseNotFoundError, getCaseSpineService, resolveSpineViewer } from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { id } = await context.params;
    const viewer = resolveSpineViewer(authResult.user, request);
    const c = await getCaseSpineService().getCase(id, viewer);
    return NextResponse.json({ case: c, view: viewer.role });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'get_case_spine',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

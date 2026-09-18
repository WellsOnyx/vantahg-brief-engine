import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { CaseNotFoundError, getCaseSpineService, toSpineViewRole } from '@/lib/case-spine';

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
    const { searchParams } = new URL(request.url);
    const viewer = {
      id: authResult.user.id,
      role: toSpineViewRole(authResult.user.role),
      client_id: searchParams.get('client_id'),
    };

    const c = await getCaseSpineService().getCase(id, viewer);
    return NextResponse.json({ case: c });
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

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { CaseNotFoundError, canAccessCxView, resolveSpineViewer } from '@/lib/case-spine';
import { getCmHandoffService } from '@/lib/cm';

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

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer) && viewer.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden', surface: 'cm_handoff' }, { status: 403 });
    }

    const { id } = await context.params;
    const result = await getCmHandoffService().deliver(id);
    return NextResponse.json({ handoff: result, demo: true });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'cm_handoff',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getCaseSpineService, toSpineViewRole } from '@/lib/case-spine';
import { isSignedForPortal, toPortalDetermination } from '@/lib/fanout/portal';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const viewer = {
      id: authResult.user.id,
      role: toSpineViewRole(authResult.user.role),
      client_id: clientId,
    };

    const spine = getCaseSpineService();
    const cases = await spine.listCases(viewer, { client_id: clientId ?? undefined });
    const signed = cases.filter(isSignedForPortal);
    const items = [];
    for (const c of signed) {
      const pkg = await spine.getDeterminationPackage(c.case_id);
      items.push(toPortalDetermination(c, pkg, viewer));
    }

    return NextResponse.json({
      determinations: items,
      view: viewer.role,
      demo: true,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'list_portal_determinations',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

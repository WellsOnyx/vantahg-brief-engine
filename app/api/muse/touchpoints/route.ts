/**
 * GET /api/muse/touchpoints
 *
 * CX lens hook. Lists relationship touchpoints only when Muse is
 * entitled (MUSE_CX_ENABLED=true and MUSE_API_KEY set). Otherwise an
 * empty list. Never returns clinical case content. Never calls muse.ai.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessCxView, resolveSpineViewer } from '@/lib/case-spine';
import { evaluateMuseCxEntitlement, getMemoryMuseStore } from '@/lib/muse';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'muse_touchpoints' }, { status: 403 });
    }

    const entitlement = evaluateMuseCxEntitlement();
    const accountId = new URL(request.url).searchParams.get('account_id') ?? undefined;
    const touchpoints = entitlement.entitled ? getMemoryMuseStore().list(accountId ?? undefined) : [];

    return NextResponse.json({
      ...entitlement,
      touchpoints,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'muse_touchpoints',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

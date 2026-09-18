import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessCxView, resolveSpineViewer } from '@/lib/case-spine';
import { runSyntheticPack } from '@/lib/golive';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'golive' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { client_id?: string };
    const result = await runSyntheticPack({
      clientId: body.client_id || SYNTHETIC_CLIENT_ID,
      actor: authResult.user.id,
    });
    return NextResponse.json(result, { status: result.passed ? 200 : 422 });
  } catch (err) {
    return apiError(err, {
      operation: 'golive_synthetic',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

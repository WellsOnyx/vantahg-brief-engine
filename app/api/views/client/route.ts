import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessClientView, resolveSpineViewer } from '@/lib/case-spine';
import { buildClientLens, seedSyntheticRoleViews } from '@/lib/views';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessClientView(viewer) && viewer.role !== 'cx') {
      return NextResponse.json({ error: 'Forbidden', surface: 'client' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('seed') === 'synthetic') {
      await seedSyntheticRoleViews(authResult.user.id);
    }

    const requested =
      viewer.role === 'client' ? viewer.client_id : searchParams.get('client_id');
    const lens = await buildClientLens(viewer, requested);
    return NextResponse.json({
      ...lens,
      notes: undefined,
      cx_notes: undefined,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'client_lens',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

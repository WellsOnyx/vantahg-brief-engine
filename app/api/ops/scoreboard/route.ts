import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessCxView, resolveSpineViewer } from '@/lib/case-spine';
import { buildOpsScoreboard } from '@/lib/ops';
import { seedSyntheticReports } from '@/lib/reporting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'ops_scoreboard' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('seed') === 'synthetic') {
      await seedSyntheticReports(authResult.user.id);
    }

    const board = await buildOpsScoreboard(viewer, searchParams.get('client_id'));
    return NextResponse.json({ ...board, demo: true });
  } catch (err) {
    return apiError(err, {
      operation: 'ops_scoreboard',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

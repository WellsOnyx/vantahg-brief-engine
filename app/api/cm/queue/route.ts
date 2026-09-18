import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessClientView, resolveSpineViewer } from '@/lib/case-spine';
import { getCmHandoffService } from '@/lib/cm';
import { seedSyntheticReports } from '@/lib/reporting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessClientView(viewer) && viewer.role !== 'cx') {
      return NextResponse.json({ error: 'Forbidden', surface: 'cm_queue' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('seed') === 'synthetic') {
      await seedSyntheticReports(authResult.user.id);
    }

    const clientId = viewer.role === 'client' ? viewer.client_id : searchParams.get('client_id');
    const items = await getCmHandoffService().listFeed(clientId);
    return NextResponse.json({
      event: 'cm.handoff',
      items,
      count: items.length,
      demo: true,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'cm_queue',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

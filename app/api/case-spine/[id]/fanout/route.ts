import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  CaseNotFoundError,
  canMutateFanout,
  getCaseSpineService,
  resolveSpineViewer,
} from '@/lib/case-spine';
import { getFanoutService } from '@/lib/fanout';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canMutateFanout(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'fanout' }, { status: 403 });
    }

    const { id } = await context.params;
    await getCaseSpineService().getCase(id, viewer);
    const result = await getFanoutService().processCase(id, authResult.user.id);
    return NextResponse.json({ fanout: result });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'process_case_fanout',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { id } = await context.params;
    const viewer = resolveSpineViewer(authResult.user, request);
    const c = await getCaseSpineService().getCase(id, viewer);
    return NextResponse.json({
      case_id: c.case_id,
      state: c.state,
      fanout_status: c.fanout_status,
      fanout_stub: c.fanout_stub,
      billable_event_id: c.billable_event_id,
      open_tasks: c.open_tasks,
    });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'get_case_fanout',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

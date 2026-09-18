import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessMedReviewView, getCaseSpineService, resolveSpineViewer } from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessMedReviewView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'med_review' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const svc = getCaseSpineService();
    let cases = await svc.listMdQueue(viewer);
    if (searchParams.get('seed') === 'synthetic' && cases.length === 0) {
      await svc.seedSyntheticMdQueue(authResult.user.id);
      cases = await svc.listMdQueue(viewer);
    }

    return NextResponse.json({ cases, view: 'med_review', sort: 'sla_then_priority' });
  } catch (err) {
    return apiError(err, {
      operation: 'list_md_queue',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessMedReviewView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'med_review' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { seed?: boolean };
    const svc = getCaseSpineService();
    const seeded = body.seed === false ? [] : await svc.seedSyntheticMdQueue(authResult.user.id);
    const cases = await svc.listMdQueue(viewer);
    return NextResponse.json({ cases, seeded: seeded.length, sort: 'sla_then_priority' }, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'seed_md_queue',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

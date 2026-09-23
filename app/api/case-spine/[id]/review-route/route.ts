import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { UmProductGuardError, assertNoChargeOverride } from '@/lib/billing/um-guards';
import { isReviewRoute } from '@/lib/billing/um-price-card';
import {
  CaseNotFoundError,
  canAccessMedReviewView,
  getCaseSpineService,
  resolveSpineViewer,
} from '@/lib/case-spine';

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
    if (!canAccessMedReviewView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'med_review' }, { status: 403 });
    }

    const { id } = await context.params;
    await getCaseSpineService().getCase(id, viewer);
    const body = (await request.json().catch(() => ({}))) as {
      touch?: unknown;
      auto_reason?: unknown;
      gold_card?: unknown;
      charge_amount?: unknown;
      trailing_auto_rate?: unknown;
    };

    if (!isReviewRoute(body.touch)) {
      return NextResponse.json(
        { error: 'touch must be auto|nurse|md|external', code: 'invalid_route' },
        { status: 400 },
      );
    }
    if (body.charge_amount != null) {
      const supplied = typeof body.charge_amount === 'number' ? body.charge_amount : Number.NaN;
      assertNoChargeOverride({ route: body.touch, suppliedCharge: supplied });
    }

    const result = await getCaseSpineService().assignReviewRoute(
      id,
      {
        touch: body.touch,
        auto_reason: typeof body.auto_reason === 'string' ? body.auto_reason : null,
        gold_card: body.gold_card === true,
        trailing_auto_rate:
          typeof body.trailing_auto_rate === 'number' ? body.trailing_auto_rate : undefined,
      },
      authResult.user.id,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UmProductGuardError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err instanceof Error && err.message.includes('price card')) {
      return NextResponse.json({ error: err.message, code: 'charge_override' }, { status: 409 });
    }
    return apiError(err, {
      operation: 'assign_review_route',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

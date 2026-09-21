import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  BriefRequiredError,
  CaseNotFoundError,
  DETERMINATIONS,
  IllegalSignError,
  IllegalTransitionError,
  canAccessMedReviewView,
  getCaseSpineService,
  resolveSpineViewer,
  type SpineDetermination,
} from '@/lib/case-spine';

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
    if (!canAccessMedReviewView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'med_review' }, { status: 403 });
    }

    const { id } = await context.params;
    await getCaseSpineService().getCase(id, viewer);
    const body = (await request.json().catch(() => ({}))) as {
      determination?: string;
      rationale?: string;
      cm_flags?: string[];
      deny_reason_code?: string | null;
    };

    if (!body.determination || !(DETERMINATIONS as readonly string[]).includes(body.determination)) {
      return NextResponse.json(
        { error: 'determination must be approve|deny|pend|partial', code: 'invalid_determination' },
        { status: 400 },
      );
    }
    if (typeof body.rationale !== 'string' || !body.rationale.trim()) {
      return NextResponse.json(
        { error: 'rationale is required', code: 'rationale_required' },
        { status: 400 },
      );
    }

    const ctx = getRequestContext(request);
    const result = await getCaseSpineService().signDetermination(
      id,
      {
        determination: body.determination as SpineDetermination,
        rationale: body.rationale,
        cm_flags: body.cm_flags as never,
        deny_reason_code: body.deny_reason_code as never,
        session_refs: { ip: ctx.ip, request_id: ctx.requestId },
      },
      authResult.user.id,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BriefRequiredError || err instanceof IllegalSignError) {
      return NextResponse.json(
        { error: err.message, code: err.code, case_id: err.case_id },
        { status: 409 },
      );
    }
    if (err instanceof IllegalTransitionError) {
      return NextResponse.json(
        { error: err.message, code: err.code, from_state: err.from_state, to_state: err.to_state },
        { status: 409 },
      );
    }
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'sign_case_spine_determination',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

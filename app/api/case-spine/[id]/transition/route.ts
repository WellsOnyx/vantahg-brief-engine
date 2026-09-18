import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  BriefRequiredError,
  CASE_SPINE_STATES,
  CaseNotFoundError,
  IllegalSignError,
  IllegalTransitionError,
  getCaseSpineService,
  type TransitionInput,
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

    const { id } = await context.params;
    const body = (await request.json()) as TransitionInput;
    if (!body?.to_state || !(CASE_SPINE_STATES as readonly string[]).includes(body.to_state)) {
      return NextResponse.json({ error: 'to_state is required and must be a spine state' }, { status: 400 });
    }

    const result = await getCaseSpineService().transitionCase(
      id,
      body,
      authResult.user.id,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return NextResponse.json(
        { error: err.message, code: err.code, from_state: err.from_state, to_state: err.to_state },
        { status: 409 },
      );
    }
    if (err instanceof BriefRequiredError) {
      return NextResponse.json(
        { error: err.message, code: err.code, case_id: err.case_id, attempted_state: err.attempted_state },
        { status: 409 },
      );
    }
    if (err instanceof IllegalSignError) {
      return NextResponse.json(
        { error: err.message, code: err.code, case_id: err.case_id },
        { status: 409 },
      );
    }
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'transition_case_spine',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

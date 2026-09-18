import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  CaseNotFoundError,
  getCaseSpineService,
  type AttachBriefInput,
} from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { id } = await context.params;
    const svc = getCaseSpineService();
    const c = await svc.getCase(id);
    const brief = await svc.getBrief(id);
    if (!brief) {
      return NextResponse.json({ error: 'Brief not attached', case: c }, { status: 404 });
    }
    return NextResponse.json({ case: c, brief });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'get_case_spine_brief',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as AttachBriefInput;
    const result = await getCaseSpineService().attachBrief(id, body, authResult.user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'attach_case_spine_brief',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

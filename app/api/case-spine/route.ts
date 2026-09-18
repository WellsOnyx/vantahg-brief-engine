import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  AUTH_WORKFLOW_TYPES,
  CASE_SPINE_STATES,
  getCaseSpineService,
  resolveSpineViewer,
  type AuthWorkflowType,
  type CaseSpineState,
  type CreateCaseInput,
  type ListCasesFilters,
  type SlaStatus,
} from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const viewer = resolveSpineViewer(authResult.user, request);
    const filters: ListCasesFilters = {
      client_id: searchParams.get('client_id') ?? undefined,
      state: isState(searchParams.get('state')) ? (searchParams.get('state') as CaseSpineState) : undefined,
      type: isType(searchParams.get('type')) ? (searchParams.get('type') as AuthWorkflowType) : undefined,
      sla_status: isSlaStatus(searchParams.get('sla_status'))
        ? (searchParams.get('sla_status') as SlaStatus)
        : undefined,
      stuck: searchParams.get('stuck') === '1' || searchParams.get('stuck') === 'true',
      escalation: searchParams.get('escalation') === '1' || searchParams.get('escalation') === 'true',
      open: searchParams.get('open') === '1' || searchParams.get('open') === 'true',
      has_task: searchParams.get('has_task') ?? undefined,
    };

    const cases = await getCaseSpineService().listCases(viewer, filters);
    return NextResponse.json({ cases, view: viewer.role });
  } catch (err) {
    return apiError(err, {
      operation: 'list_case_spine',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as CreateCaseInput;
    if (!body?.client_id || typeof body.client_id !== 'string') {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const result = await getCaseSpineService().createCase(body, authResult.user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'create_case_spine',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

function isState(value: string | null): value is CaseSpineState {
  return Boolean(value && (CASE_SPINE_STATES as readonly string[]).includes(value));
}

function isType(value: string | null): value is AuthWorkflowType {
  return Boolean(value && (AUTH_WORKFLOW_TYPES as readonly string[]).includes(value));
}

function isSlaStatus(value: string | null): value is SlaStatus {
  return value === 'ok' || value === 'at_risk' || value === 'missed';
}

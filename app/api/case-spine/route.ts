import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  AUTH_WORKFLOW_TYPES,
  CASE_SPINE_STATES,
  getCaseSpineService,
  toSpineViewRole,
  type AuthWorkflowType,
  type CaseSpineState,
  type CreateCaseInput,
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
    const state = searchParams.get('state');
    const type = searchParams.get('type');
    const slaStatus = searchParams.get('sla_status');
    const clientId = searchParams.get('client_id');

    const viewer = {
      id: authResult.user.id,
      role: toSpineViewRole(authResult.user.role),
      client_id: clientId,
    };

    const cases = await getCaseSpineService().listCases(viewer, {
      client_id: clientId ?? undefined,
      state: isState(state) ? state : undefined,
      type: isType(type) ? type : undefined,
      sla_status: isSlaStatus(slaStatus) ? slaStatus : undefined,
    });

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

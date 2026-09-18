import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  canAccessCxView,
  resolveSpineViewer,
  type ListCasesFilters,
  type SlaStatus,
} from '@/lib/case-spine';
import { buildCxLens, seedSyntheticRoleViews } from '@/lib/views';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'cx_notes' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('seed') === 'synthetic') {
      await seedSyntheticRoleViews(authResult.user.id);
    }

    const sla = searchParams.get('sla_status');
    const filters: ListCasesFilters = {
      client_id: searchParams.get('client_id') ?? undefined,
      sla_status: sla === 'ok' || sla === 'at_risk' || sla === 'missed' ? (sla as SlaStatus) : undefined,
      stuck: searchParams.get('stuck') === '1' || searchParams.get('stuck') === 'true',
      escalation: searchParams.get('escalation') === '1' || searchParams.get('escalation') === 'true',
      open: searchParams.get('open') === '1' || searchParams.get('open') === 'true',
      has_task: searchParams.get('has_task') ?? undefined,
    };

    const lens = await buildCxLens(viewer, filters);
    return NextResponse.json(lens);
  } catch (err) {
    return apiError(err, {
      operation: 'cx_lens',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

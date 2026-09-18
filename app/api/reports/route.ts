import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessClientView, resolveSpineViewer } from '@/lib/case-spine';
import {
  REPORT_KINDS,
  buildReportBundle,
  loadReportSource,
  parseReportQuery,
  seedSyntheticReports,
  type VolumeGrain,
} from '@/lib/reporting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessClientView(viewer) && viewer.role !== 'cx') {
      return NextResponse.json({ error: 'Forbidden', surface: 'reports' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('seed') === 'synthetic') {
      await seedSyntheticReports(authResult.user.id);
    }

    const filters = parseReportQuery(
      searchParams,
      viewer.role === 'client' ? viewer.client_id : undefined,
    );
    const source = await loadReportSource(viewer, filters);
    const bundle = buildReportBundle(source, filters);

    return NextResponse.json({
      ...bundle,
      kinds: REPORT_KINDS,
      grain: (filters.grain ?? 'day') as VolumeGrain,
      demo: true,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'client_reports',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

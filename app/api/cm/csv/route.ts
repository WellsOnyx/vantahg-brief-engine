import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessClientView, resolveSpineViewer } from '@/lib/case-spine';
import { CM_CSV_COLUMNS, getCmHandoffService } from '@/lib/cm';
import { seedSyntheticReports } from '@/lib/reporting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessClientView(viewer) && viewer.role !== 'cx') {
      return NextResponse.json({ error: 'Forbidden', surface: 'cm_csv' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('seed') === 'synthetic') {
      await seedSyntheticReports(authResult.user.id);
    }

    const clientId = viewer.role === 'client' ? viewer.client_id : searchParams.get('client_id');
    const drop = await getCmHandoffService().dailyCsv(clientId, searchParams.get('day') ?? undefined);
    const format = searchParams.get('format');

    if (format === 'json') {
      return NextResponse.json({ ...drop, columns: CM_CSV_COLUMNS, demo: true });
    }

    return new NextResponse(drop.csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="vantaum-cm-${drop.day}.csv"`,
        'x-vantaum-cm-stub': 'daily_csv_drop',
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'cm_csv_drop',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

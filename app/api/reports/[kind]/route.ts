import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessClientView, resolveSpineViewer } from '@/lib/case-spine';
import {
  REPORT_CSV_COLUMNS,
  REPORT_KINDS,
  buildClientReport,
  loadReportSource,
  parseReportQuery,
  reportToCsv,
  seedSyntheticReports,
  type ReportKind,
} from '@/lib/reporting';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessClientView(viewer) && viewer.role !== 'cx') {
      return NextResponse.json({ error: 'Forbidden', surface: 'reports' }, { status: 403 });
    }

    const { kind } = await context.params;
    if (!(REPORT_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: 'Unknown report kind', kinds: REPORT_KINDS }, { status: 400 });
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
    const report = buildClientReport(kind as ReportKind, source, filters);
    const format = searchParams.get('format');

    if (format === 'csv') {
      const csv = reportToCsv(report);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="vantaum-${kind}.csv"`,
          'x-vantaum-report-columns': REPORT_CSV_COLUMNS[kind as ReportKind].join(','),
        },
      });
    }

    return NextResponse.json({
      report,
      columns: REPORT_CSV_COLUMNS[kind as ReportKind],
      demo: true,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'client_report_kind',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

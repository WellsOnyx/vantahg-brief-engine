import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import { exportReviewDataset, toJsonl, DEIDENT_METHOD } from '@/lib/dataset/review-dataset';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/review-dataset?format=jsonl|json&since=<iso>&limit=<n>
 *
 * Streams the consolidated, de-identified review training dataset for model
 * building. Internal admins only. The response carries only pseudonymous
 * sample_refs + Safe Harbor–scrubbed payloads — never case ids or raw PHI.
 *
 * format=jsonl (default) returns one JSON object per line (ideal for training
 * pipelines); format=json returns a single JSON array with a small envelope.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin', 'builder', 'ceo', 'slt']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const url = new URL(request.url);
    const format = (url.searchParams.get('format') ?? 'jsonl').toLowerCase();
    const since = url.searchParams.get('since') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 50000) : undefined;

    const records = await exportReviewDataset({ since, limit });

    // Audit the export (no PHI — counts + params only).
    await logAuditEvent(null, 'review_dataset_exported', authResult.user.email, {
      count: records.length,
      format,
      since: since ?? null,
      deident_method: DEIDENT_METHOD,
    }, getRequestContext(request)).catch(() => {});

    if (format === 'json') {
      return NextResponse.json({
        deident_method: DEIDENT_METHOD,
        count: records.length,
        records,
      });
    }

    // JSONL download.
    const body = toJsonl(records);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vantaum-review-dataset.jsonl"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'export_review_dataset',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

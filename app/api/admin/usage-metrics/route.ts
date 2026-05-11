import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getUsageMetrics } from '@/lib/usage-metrics';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/usage-metrics
 *
 * Month-to-date operational metrics for the admin dashboard:
 *   - briefs generated / failed (from audit_log)
 *   - token usage + estimated Anthropic cost
 *   - intake volume by channel (from intake_log)
 *   - active cases + SLA compliance (from cases)
 *
 * Admin-only. Rate-limited because the underlying queries scan multiple
 * tables month-to-date and are not currently denormalized.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const metrics = await getUsageMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    return apiError(err, {
      operation: 'fetch_usage_metrics',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

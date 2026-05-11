import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getRealModeStatus } from '@/lib/real-mode-status';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/real-mode-status
 *
 * Pre-flight readiness check. Returns a per-component breakdown of what's
 * wired up (Supabase, Anthropic, cron secret, eFax, OCR, Sentry) plus an
 * overall verdict (demo / partial / ready) and, for each missing component,
 * the list of env vars to set and an actionable hint.
 *
 * Admin-only. Cheap: one SELECT 1 against Supabase if it's already
 * configured; no LLM calls.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const status = await getRealModeStatus();
    return NextResponse.json(status);
  } catch (err) {
    return apiError(err, {
      operation: 'fetch_real_mode_status',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

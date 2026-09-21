/**
 * GET /api/muse/status
 *
 * Fail closed without MUSE_API_KEY (503 not_configured).
 * A present key still returns live_call: false — this stub does not
 * call muse.ai.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessCxView, resolveSpineViewer } from '@/lib/case-spine';
import { readMuseConnector } from '@/lib/muse';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'muse_status' }, { status: 403 });
    }

    const snap = readMuseConnector();
    if (!snap.configured) {
      return NextResponse.json({ error: 'not_configured', live_call: false }, { status: 503 });
    }
    return NextResponse.json(snap);
  } catch (err) {
    return apiError(err, {
      operation: 'muse_status',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

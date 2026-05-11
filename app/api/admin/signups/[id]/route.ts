import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/signups/[id]
 *
 * Admin-only single-row read of a signup_requests row for the
 * /admin/signups/[id] detail view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin', 'ceo', 'slt', 'builder']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    if (isDemoMode()) {
      // Re-render the list endpoint's demo rows to keep them consistent.
      const list = await (await fetch(new URL('/api/admin/signups', request.url))).json();
      const row = Array.isArray(list) ? list.find((r: { id: string }) => r.id === id) : null;
      if (!row) {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return NextResponse.json(row);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('signup_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return apiError(error, {
        operation: 'get_signup',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'get_signup',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

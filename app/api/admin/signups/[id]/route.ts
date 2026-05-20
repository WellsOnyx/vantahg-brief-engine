import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
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
      return NextResponse.json(row, { headers: { 'X-Demo-Mode': 'true' } });
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

    // Latest contract for this signup — the UI uses it to render the
    // signature status and drive the "Send for signature" action.
    // We expose only the fields the UI needs; the raw variable_values
    // contain TPA contact info that doesn't need to round-trip to the
    // browser.
    const { data: latestContract, error: contractErr } = await supabase
      .from('contracts')
      .select('id, status, hellosign_signature_request_id, sent_at, signed_at, generated_at')
      .eq('signup_id', id)
      .order('generated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (contractErr) {
      // Non-fatal for the detail view; log for ops visibility (transient DB
      // hiccup shouldn't break admin review).
      await logAuditEvent(
        null,
        'security:signup_latest_contract_query_failed',
        authResult.user.email,
        { signup_id: id, error_code: contractErr.code ?? null },
        getRequestContext(request),
      ).catch(() => {});
    }

    return NextResponse.json({ ...data, latest_contract: latestContract ?? null });
  } catch (err) {
    return apiError(err, {
      operation: 'get_signup',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

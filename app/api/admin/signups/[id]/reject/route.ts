import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/signups/[id]/reject
 *
 * Marks a pending signup request as rejected. Records the reason for
 * accountability — required, not optional.
 *
 * Admin-only. Does not delete the signup row; it stays in the table
 * with status='rejected' + rejection_reason populated so the audit
 * trail of who-rejected-what is preserved.
 *
 * Idempotent on already-rejected rows. Rejecting an already-approved
 * row returns 400 (would orphan the linked client) — admins resolve
 * via a different workflow (delete the client + reset status).
 */

const RejectBodySchema = z.object({
  reason: z.string().trim().min(1, 'reason required').max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Reject recorded (demo mode — no row updated).',
      }, { headers: { 'X-Demo-Mode': 'true' } });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = RejectBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'A reason is required when rejecting a signup.' }, { status: 400 });
    }
    const { reason } = parsed.data;

    const supabase = getServiceClient();

    const { data: signup, error: readErr } = await supabase
      .from('signup_requests')
      .select('id, status, legal_name, primary_contact_email')
      .eq('id', id)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return apiError(readErr, {
        operation: 'reject_signup_read',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    if (signup.status === 'rejected') {
      return NextResponse.json({ success: true, already_rejected: true });
    }

    if (signup.status === 'approved' || signup.status === 'signed' || signup.status === 'live') {
      return NextResponse.json(
        {
          error:
            'Cannot reject a signup that has been approved or onboarded. The linked client tenant must be handled separately.',
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('signup_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        reviewed_at: now,
        reviewed_by: authResult.user.email,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return apiError(updateErr, {
        operation: 'reject_signup_update',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(null, 'signup_rejected', authResult.user.email, {
      signup_id: id,
      legal_name: signup.legal_name,
      // email DOMAIN only — even though business contact info isn't PHI,
      // be conservative in audit details
      email_domain: signup.primary_contact_email?.split('@')[1] ?? null,
      reason_length: reason.length,
    }, getRequestContext(request));

    return NextResponse.json({ success: true, signup: updated });
  } catch (err) {
    return apiError(err, {
      operation: 'reject_signup',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

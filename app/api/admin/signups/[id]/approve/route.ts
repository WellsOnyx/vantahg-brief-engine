import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { autoAssignDeliveryTeam, type AssignmentOutcome } from '@/lib/delivery/auto-assign';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/signups/[id]/approve
 *
 * Approves a pending signup request. Creates the matching clients row
 * (the tenant), links it back to the signup_request via client_id,
 * marks the request status='approved', and writes the audit trail.
 *
 * Body (optional):
 *   pepm_rate_cents — integer cents. Sets the negotiated PEPM rate on
 *     the signup_request for later reference. Stored as cents to avoid
 *     float comparison bugs.
 *
 * Notes:
 *   - Admin-only (admin role; not ceo/slt/builder — approve creates a
 *     tenant which has compliance + billing implications).
 *   - Idempotent on already-approved rows (returns the existing state).
 *   - Does NOT create reviewers — that's a separate onboarding step
 *     handled by bootstrap-real-client or /staff page.
 *   - If contract_storage_path is null, audits a signup_approved_without_baa
 *     event so the gap is traceable. Hard enforcement (block approve
 *     without contract) is deferred until contract upload (piece 6/N)
 *     lands so admins can complete a self-test of the flow.
 */

const ApproveBodySchema = z.object({
  pepm_rate_cents: z.number().int().nonnegative().max(100_000).optional(),
}).optional().default({});

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
        message: 'Approve recorded (demo mode — no tenant created).',
      });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = ApproveBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body — pepm_rate_cents must be a non-negative integer' }, { status: 400 });
    }
    const { pepm_rate_cents } = parsed.data;

    const supabase = getServiceClient();

    // Load the signup row.
    const { data: signup, error: readErr } = await supabase
      .from('signup_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return apiError(readErr, {
        operation: 'approve_signup_read',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Idempotency: already approved → return current state, no-op audit.
    if (signup.status === 'approved' || signup.status === 'live' || signup.status === 'signed') {
      return NextResponse.json({
        success: true,
        already_approved: true,
        signup,
      });
    }

    // Cannot approve a rejected row.
    if (signup.status === 'rejected') {
      return NextResponse.json(
        { error: 'Cannot approve a rejected signup. Submit a new application or contact support.' },
        { status: 400 },
      );
    }

    // Create the clients (tenant) row using the captured prospect data.
    // Mirrors the defaults bootstrap-real-client uses so the resulting
    // tenant is interchangeable regardless of which path created it.
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name: signup.legal_name,
        type: 'tpa',
        contact_name: signup.primary_contact_name,
        contact_email: signup.primary_contact_email,
        contact_phone: signup.primary_contact_phone,
        contracted_sla_hours: 48,
        uses_interqual: false,
        uses_mcg: false,
        onboarding_status: 'active',
        onboarding_notes: `Created from signup_request ${signup.id} (${signup.legal_name}).`,
      })
      .select('id, name')
      .single();

    if (clientErr || !newClient) {
      return apiError(clientErr ?? new Error('Client insert returned no row'), {
        operation: 'approve_signup_create_client',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Update the signup row to link the new client + mark approved.
    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('signup_requests')
      .update({
        status: 'approved',
        client_id: newClient.id,
        approved_at: now,
        approved_by: authResult.user.email,
        reviewed_at: signup.reviewed_at ?? now,
        reviewed_by: signup.reviewed_by ?? authResult.user.email,
        pepm_rate_cents: pepm_rate_cents ?? signup.pepm_rate_cents ?? null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      // The client row is already created but the signup_request didn't
      // get linked. Log loudly so the admin can manually reconcile —
      // surfaces as a security event because the audit trail is broken.
      await logAuditEvent(null, 'security:signup_approve_link_failed', authResult.user.email, {
        signup_id: id,
        orphan_client_id: newClient.id,
        error_code: updateErr.code ?? null,
      }, getRequestContext(request));
      return apiError(updateErr, {
        operation: 'approve_signup_link',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Audit trail — two events for clarity:
    //   1. signup_approved (the workflow transition)
    //   2. client_onboarded_from_signup (the tenant-creation event)
    await logAuditEvent(null, 'signup_approved', authResult.user.email, {
      signup_id: id,
      client_id: newClient.id,
      legal_name: signup.legal_name,
      pepm_rate_cents: pepm_rate_cents ?? signup.pepm_rate_cents ?? null,
    }, getRequestContext(request));

    await logAuditEvent(newClient.id, 'client_onboarded_from_signup', authResult.user.email, {
      signup_id: id,
      source: 'admin_review_approve',
      legal_name: signup.legal_name,
    }, getRequestContext(request));

    // Compliance signal — approving without a BAA on file is traceable.
    if (!signup.contract_storage_path) {
      await logAuditEvent(null, 'security:signup_approved_without_baa', authResult.user.email, {
        signup_id: id,
        client_id: newClient.id,
        legal_name: signup.legal_name,
        reason: 'contract_storage_path was null at approve time',
      }, getRequestContext(request));
    }

    // Auto-assign a Delivery Lead + Concierge to this client. Picks the
    // concierge with the most spare capacity that can absorb the TPA's
    // expected weekly auth volume, then derives the DL from that concierge.
    // Failures are non-fatal - approval succeeds either way, but the
    // admin is told to assign manually. Audit-logged either way.
    let assignmentOutcome: AssignmentOutcome | null = null;
    try {
      const expectedAuths = signup.expected_weekly_auths ?? 0;
      assignmentOutcome = await autoAssignDeliveryTeam(supabase, {
        client_id: newClient.id,
        expected_weekly_auths: expectedAuths,
        assigned_by: authResult.user.email,
      });

      if (assignmentOutcome.ok) {
        await logAuditEvent(newClient.id, 'delivery_team_auto_assigned', authResult.user.email, {
          signup_id: id,
          concierge_id: assignmentOutcome.concierge_id,
          concierge_email: assignmentOutcome.concierge_email,
          delivery_lead_id: assignmentOutcome.delivery_lead_id,
          assignment_id: assignmentOutcome.assignment_id,
          assigned_weekly_volume: assignmentOutcome.assigned_weekly_volume,
        }, getRequestContext(request));
      } else {
        await logAuditEvent(newClient.id, 'delivery_team_auto_assign_failed', authResult.user.email, {
          signup_id: id,
          code: assignmentOutcome.code,
          message: assignmentOutcome.message,
        }, getRequestContext(request));
      }
    } catch (err) {
      // Don't let an unexpected assignment failure block approval.
      await logAuditEvent(newClient.id, 'delivery_team_auto_assign_threw', authResult.user.email, {
        signup_id: id,
        error_message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      }, getRequestContext(request));
    }

    return NextResponse.json({
      success: true,
      signup: updated,
      client: newClient,
      assignment: assignmentOutcome,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'approve_signup',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

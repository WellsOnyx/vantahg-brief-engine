import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-mode';
import { sendNotification } from '@/lib/notifications';

/**
 * Concierge follow-up notification on new intake.
 *
 * Part of channel-agnostic intake: when a case is created from ANY channel
 * (eFax, email, portal, API, voice), the concierge assigned to that case's
 * client is notified so they can follow up with the requesting provider for
 * anything missing — mirroring the human-concierge model the service runs on.
 *
 * Concierge resolution: a case's concierge is derived from its client via the
 * active `client_concierge_assignments` row (the same table the DL dashboard
 * and `lib/delivery/assignment.ts` use). A case with no client, or a client
 * with no active concierge assignment, is audit-logged as `unassigned` and
 * skipped — this is a best-effort follow-up signal, never a hard dependency,
 * and it must never throw into the intake path.
 */

export interface NotifyConciergeResult {
  notified: boolean;
  concierge_id: string | null;
  reason?: string;
}

/**
 * Notify the concierge responsible for a case's client that a new case has
 * arrived and needs follow-up. Best-effort; never throws.
 */
export async function notifyConciergeNewIntake(
  caseId: string,
  opts: { caseNumber?: string; channel?: string } = {},
): Promise<NotifyConciergeResult> {
  try {
    if (isDemoMode()) {
      console.log(
        `[NOTIFICATION] concierge_intake_assigned | Case: ${opts.caseNumber ?? caseId} | Channel: ${opts.channel ?? 'unknown'}`,
      );
      return { notified: true, concierge_id: 'demo-concierge' };
    }

    const supabase = getServiceClient();

    // Resolve the case's client.
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_number, client_id')
      .eq('id', caseId)
      .single();

    if (!caseRow) {
      return { notified: false, concierge_id: null, reason: 'case_not_found' };
    }

    const caseNumber = (caseRow.case_number as string | null) ?? opts.caseNumber ?? caseId;

    if (!caseRow.client_id) {
      await logAuditEvent(caseId, 'concierge_intake_unassigned', 'system', {
        reason: 'no_client',
        channel: opts.channel ?? null,
      });
      return { notified: false, concierge_id: null, reason: 'no_client' };
    }

    // Find the active concierge assignment for this client.
    const { data: assignment } = await supabase
      .from('client_concierge_assignments')
      .select('concierge_id')
      .eq('client_id', caseRow.client_id)
      .eq('active', true)
      .maybeSingle();

    const conciergeId = (assignment?.concierge_id as string | null) ?? null;
    if (!conciergeId) {
      await logAuditEvent(caseId, 'concierge_intake_unassigned', 'system', {
        reason: 'no_active_concierge',
        client_id: caseRow.client_id,
        channel: opts.channel ?? null,
      });
      return { notified: false, concierge_id: null, reason: 'no_active_concierge' };
    }

    // Load the concierge contact details.
    const { data: concierge } = await supabase
      .from('concierges')
      .select('id, name, email')
      .eq('id', conciergeId)
      .single();

    if (!concierge?.email) {
      await logAuditEvent(caseId, 'concierge_intake_unassigned', 'system', {
        reason: 'concierge_no_contact',
        concierge_id: conciergeId,
        channel: opts.channel ?? null,
      });
      return { notified: false, concierge_id: conciergeId, reason: 'concierge_no_contact' };
    }

    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';

    await sendNotification({
      type: 'concierge_intake_assigned',
      recipient_email: concierge.email,
      recipient_name: concierge.name,
      case_number: caseNumber,
      case_id: caseId,
      subject: `New intake to follow up: ${caseNumber}`,
      body: `A new case (${caseNumber}) arrived via ${opts.channel ?? 'intake'} for your client. Please review and follow up with the requesting provider for any missing documentation at ${baseUrl}/cases/${caseId}`,
    });

    await logAuditEvent(caseId, 'concierge_intake_notified', 'system', {
      concierge_id: conciergeId,
      channel: opts.channel ?? null,
    });

    return { notified: true, concierge_id: conciergeId };
  } catch (err) {
    // Never let concierge notification break the intake path.
    const errorKind = err instanceof Error ? err.name : typeof err;
    await logAuditEvent(caseId, 'concierge_intake_notify_failed', 'system', {
      error_kind: errorKind,
      channel: opts.channel ?? null,
    }).catch(() => {});
    return { notified: false, concierge_id: null, reason: 'error' };
  }
}

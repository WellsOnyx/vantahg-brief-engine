import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase, persistBriefResult, type BriefResult } from '@/lib/generate-brief';
import { assignToPod } from '@/lib/pod-assignment-engine';
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { notifyLpnCaseAssigned, notifyCaseAssigned } from '@/lib/notifications';
import { notifyConciergeNewIntake } from '@/lib/notifications/concierge-intake';
import type { Case, IntakeChannel } from '@/lib/types';

/**
 * Channel-agnostic intake finalizer.
 *
 * Every intake channel (eFax, HIPAA email, manual portal, external API, and —
 * once it ships — Gravity Rail voice) inserts its own `cases` row, then calls
 * this one function to run the **identical** downstream chassis:
 *
 *   1. Notify the concierge assigned to the case's client (follow-up signal).
 *   2. Generate the AI clinical brief + fact-check and persist it.
 *   3. Route to the clinician: assign to a pod (LPN → RN → MD nursing tier);
 *      on success notify the LPN. If no pod is available, fall back to direct
 *      physician auto-assignment and notify the reviewer.
 *
 * This mirrors the sequence the portal path (`POST /api/cases`) has always run
 * inline, so behavior is proven — the new piece is the concierge follow-up and
 * the fact that ALL channels now run it rather than only portal + triage.
 *
 * Contract: **best-effort and non-throwing.** Each step is independently
 * guarded so one failure can't strand the case or break the caller's response.
 * The caller fires this after the case row exists; the case is the source of
 * truth regardless of what this returns.
 *
 * Gated behind `ENABLE_CHANNEL_AGNOSTIC_INTAKE` at the call sites — see
 * `isChannelAgnosticIntakeEnabled()`.
 */

export interface FinalizeIntakeOptions {
  /** Originating channel, for audit context only. */
  channel?: IntakeChannel;
  /** Audit actor; defaults to 'system'. */
  actor?: string;
}

export interface FinalizeIntakeResult {
  finalized: boolean;
  concierge_notified: boolean;
  brief_generated: boolean;
  pod_assigned: boolean;
  reviewer_assigned: boolean;
  reason?: string;
}

/**
 * Whether channel-agnostic intake finalization is enabled. Default off — when
 * off, each channel keeps its current behavior (create case + receipt, no
 * downstream for email/eFax-worker/API).
 */
export function isChannelAgnosticIntakeEnabled(): boolean {
  return process.env.ENABLE_CHANNEL_AGNOSTIC_INTAKE === 'true';
}

const EMPTY_RESULT = (
  reason: string,
  patch: Partial<FinalizeIntakeResult> = {},
): FinalizeIntakeResult => ({
  finalized: false,
  concierge_notified: false,
  brief_generated: false,
  pod_assigned: false,
  reviewer_assigned: false,
  reason,
  ...patch,
});

export async function finalizeIntakeCase(
  caseId: string,
  opts: FinalizeIntakeOptions = {},
): Promise<FinalizeIntakeResult> {
  const actor = opts.actor ?? 'system';
  const supabase = getServiceClient();

  // Load the canonical case row + client (the brief generator wants the client
  // for criteria context, exactly as the portal path passes it).
  const { data: caseRow, error: loadError } = await supabase
    .from('cases')
    .select('*, client:clients(*)')
    .eq('id', caseId)
    .single();

  if (loadError || !caseRow) {
    await logAuditEvent(caseId, 'intake_finalize_skipped', actor, {
      reason: 'case_not_found',
      channel: opts.channel ?? null,
    }).catch(() => {});
    return EMPTY_RESULT('case_not_found');
  }

  const caseData = caseRow as unknown as Case & { client?: unknown };
  const caseNumber = caseData.case_number;

  const result: FinalizeIntakeResult = {
    finalized: true,
    concierge_notified: false,
    brief_generated: false,
    pod_assigned: false,
    reviewer_assigned: false,
  };

  // 1. Concierge follow-up notification (its own internal guards; never throws).
  try {
    const conc = await notifyConciergeNewIntake(caseId, {
      caseNumber,
      channel: opts.channel,
    });
    result.concierge_notified = conc.notified;
  } catch {
    // notifyConciergeNewIntake already swallows + audits; defensive only.
  }

  // 2. Brief generation + persistence.
  try {
    const briefResult = await generateBriefForCase(caseData, {
      client: (caseData.client as Case['client']) ?? null,
    });
    if (briefResult?.brief) {
      await persistBriefResult(caseId, briefResult, supabase, {
        generatedFrom: `intake_${opts.channel ?? 'unknown'}`,
      });
      result.brief_generated = true;
    }
  } catch (err) {
    // Common cause: real Anthropic disabled. The case still exists and a
    // reviewer can regenerate; we record a PHI-safe audit line and continue so
    // routing is not blocked by a brief failure.
    const errorKind = err instanceof Error ? err.name : typeof err;
    await logAuditEvent(caseId, 'intake_finalize_brief_failed', actor, {
      error_kind: errorKind,
      channel: opts.channel ?? null,
    }).catch(() => {});
  }

  // 3. Clinician routing: pod first, physician fallback.
  try {
    const podResult = await assignToPod(caseId);
    if (podResult.assigned && podResult.lpnId && podResult.podName) {
      result.pod_assigned = true;
      await notifyLpnCaseAssigned(
        caseId,
        podResult.lpnId,
        caseNumber,
        podResult.podName,
      ).catch(() => {});
    } else {
      const assignment = await autoAssignReviewer(caseId);
      if (assignment.assigned && assignment.reviewerId) {
        result.reviewer_assigned = true;
        await notifyCaseAssigned(caseId, assignment.reviewerId).catch(() => {});
      }
    }
  } catch (err) {
    const errorKind = err instanceof Error ? err.name : typeof err;
    await logAuditEvent(caseId, 'intake_finalize_routing_failed', actor, {
      error_kind: errorKind,
      channel: opts.channel ?? null,
    }).catch(() => {});
  }

  await logAuditEvent(caseId, 'intake_finalized', actor, {
    channel: opts.channel ?? null,
    concierge_notified: result.concierge_notified,
    brief_generated: result.brief_generated,
    pod_assigned: result.pod_assigned,
    reviewer_assigned: result.reviewer_assigned,
  }).catch(() => {});

  return result;
}

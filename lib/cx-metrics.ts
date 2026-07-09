import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';

/**
 * Member-experience (CX) metrics computed from the REAL audit trail.
 *
 * Until now the CX dashboard's "member experience" card returned nulls in
 * real mode — the numbers existed only as demo fixtures. This module makes
 * them computable from events the engine already writes:
 *
 *   - first_touch_minutes_avg — for cases opened in the window, minutes
 *     from intake receipt to the first member/ops-visible action on the
 *     case (concierge notified, receipt confirmation sent, brief validated,
 *     reviewer assigned, status changed).
 *   - callbacks_completed — count of outbound member-facing touches
 *     (receipt confirmations, determination letters delivered,
 *     acknowledgments, notifications).
 *   - members_updated — distinct cases that received at least one such
 *     member-facing touch.
 *
 * Honesty rules:
 *   - A metric with zero underlying events is null, never zero-invented.
 *   - Every result carries a `basis` describing exactly what was counted,
 *     and the estimated_pending_calibration label until production data
 *     validates the event mapping.
 *   - Demo mode short-circuits to nulls — this module never fabricates.
 *
 * Query shapes are shim-compatible (select / gte / order / limit only), so
 * this works identically against Supabase and RDS through lib/db.
 */

/** Outbound, member-facing touches — the "we told the member/requester" events. */
export const MEMBER_TOUCH_ACTIONS = [
  'intake_confirmation_sent',
  'determination_letter_delivered',
  'delivery_acknowledged',
  'notification_sent',
] as const;

/** First human/ops-visible motion on a fresh case — ends the "untouched" clock. */
export const FIRST_TOUCH_ACTIONS = [
  'concierge_intake_notified',
  'intake_confirmation_sent',
  'concierge_brief_validated',
  'reviewer_assigned',
  'status_changed',
] as const;

export interface CxPulse {
  first_touch_minutes_avg: number | null;
  callbacks_completed_today: number | null;
  members_updated_today: number | null;
  basis: {
    window_start: string;
    audit_rows_scanned: number;
    member_touch_events: number;
    cases_sampled: number;
    cases_with_first_touch: number;
  };
  calibration: 'estimated_pending_calibration';
}

interface AuditRow {
  case_id: string | null;
  action: string;
  created_at: string;
}

interface CaseRow {
  id: string;
  created_at: string;
  intake_received_at: string | null;
}

const AUDIT_SCAN_LIMIT = 2000;
const CASE_SAMPLE_LIMIT = 200;

export async function computeCxPulse(now: Date = new Date()): Promise<CxPulse> {
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  const windowStartIso = windowStart.toISOString();

  const empty: CxPulse = {
    first_touch_minutes_avg: null,
    callbacks_completed_today: null,
    members_updated_today: null,
    basis: {
      window_start: windowStartIso,
      audit_rows_scanned: 0,
      member_touch_events: 0,
      cases_sampled: 0,
      cases_with_first_touch: 0,
    },
    calibration: 'estimated_pending_calibration',
  };

  // Never fabricate: demo surfaces get their numbers from the demo layer,
  // not from here.
  if (isDemoMode()) return empty;

  const supabase = getServiceClient();

  const { data: auditData } = await supabase
    .from('audit_log')
    .select('case_id, action, created_at')
    .gte('created_at', windowStartIso)
    .order('created_at', { ascending: true })
    .limit(AUDIT_SCAN_LIMIT);
  const auditRows = (auditData ?? []) as AuditRow[];

  // ── Member-facing touches ────────────────────────────────────────────
  const touchSet = new Set<string>(MEMBER_TOUCH_ACTIONS);
  const touches = auditRows.filter((r) => touchSet.has(r.action));
  const callbacks_completed_today = touches.length > 0 ? touches.length : null;
  const distinctCases = new Set(touches.map((r) => r.case_id).filter(Boolean));
  const members_updated_today = touches.length > 0 ? distinctCases.size : null;

  // ── First touch on today's fresh cases ──────────────────────────────
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, created_at, intake_received_at')
    .gte('created_at', windowStartIso)
    .order('created_at', { ascending: false })
    .limit(CASE_SAMPLE_LIMIT);
  const cases = (caseData ?? []) as CaseRow[];

  const firstTouchSet = new Set<string>(FIRST_TOUCH_ACTIONS);
  const firstEventByCase = new Map<string, string>();
  for (const r of auditRows) {
    // auditRows are ascending, so the first hit per case is the earliest.
    if (!r.case_id || !firstTouchSet.has(r.action)) continue;
    if (!firstEventByCase.has(r.case_id)) firstEventByCase.set(r.case_id, r.created_at);
  }

  const deltasMinutes: number[] = [];
  for (const c of cases) {
    const firstIso = firstEventByCase.get(c.id);
    if (!firstIso) continue;
    const startMs = new Date(c.intake_received_at ?? c.created_at).getTime();
    const mins = (new Date(firstIso).getTime() - startMs) / 60_000;
    // Guard clock skew / backfilled rows; a first touch a day later is not
    // signal for this metric.
    if (mins >= 0 && mins <= 24 * 60) deltasMinutes.push(mins);
  }

  const first_touch_minutes_avg =
    deltasMinutes.length > 0
      ? Math.round(deltasMinutes.reduce((a, b) => a + b, 0) / deltasMinutes.length)
      : null;

  return {
    first_touch_minutes_avg,
    callbacks_completed_today,
    members_updated_today,
    basis: {
      window_start: windowStartIso,
      audit_rows_scanned: auditRows.length,
      member_touch_events: touches.length,
      cases_sampled: cases.length,
      cases_with_first_touch: deltasMinutes.length,
    },
    calibration: 'estimated_pending_calibration',
  };
}

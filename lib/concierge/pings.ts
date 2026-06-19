/**
 * Concierge intake pings — the "first call" engine.
 *
 * Every entry point lands in the same place: a case row with an
 * intake_channel. The concierge's job in the first minutes is NOT
 * data entry (the brief engine is already doing the heavy lifting) —
 * it's the callback. Ring the requester, build the relationship, tell
 * them where their auth already stands.
 *
 * A ping = an active case with no outbound first-contact touchpoint
 * yet. Pings carry a callback target (intake time + CALLBACK_TARGET_
 * MINUTES) and a prep line derived from how far the brief engine has
 * already gotten, so the concierge opens the call with confidence
 * instead of questions.
 */

import type { Case } from '@/lib/types';

/** Speed-to-delight target: first outbound call within 30 minutes. */
export const CALLBACK_TARGET_MINUTES = 30;

/** Channels a touchpoint can be logged against. */
export type TouchpointChannel = 'phone' | 'email' | 'efax' | 'portal_message';

export type TouchpointOutcome =
  | 'reached'
  | 'voicemail'
  | 'no_answer'
  | 'left_message'
  | 'scheduled_callback'
  | 'email_sent';

export interface Touchpoint {
  id: string;
  created_at: string;
  case_id: string;
  concierge_id: string | null;
  direction: 'outbound' | 'inbound';
  channel: TouchpointChannel;
  outcome: TouchpointOutcome;
  notes: string | null;
  is_first_contact: boolean;
}

/** Every door into the engine, labeled for the ping feed. */
export const INTAKE_CHANNEL_LABELS: Record<string, string> = {
  efax: 'Fax',
  api: 'Gravity Rails agent',
  phone: 'Live call',
  email: 'Call center / email',
  portal: 'Client portal',
  batch_upload: 'Manual entry',
};

export function intakeChannelLabel(channel: string | null | undefined): string {
  if (!channel) return 'Manual entry';
  return INTAKE_CHANNEL_LABELS[channel] ?? 'Manual entry';
}

export type CallPrepLevel = 'auth_prepared' | 'in_motion' | 'just_arrived' | 'needs_info';

export interface CallPrep {
  level: CallPrepLevel;
  /** One line the concierge can open the call with. */
  line: string;
}

/**
 * What can the concierge promise on the call? Derived from how far the
 * pipeline has already carried the case. The point of the Chewy-style
 * model: by the time the phone rings, the auth work is usually done or
 * in motion — the call is relationship, not interrogation.
 */
export function buildCallPrep(c: Pick<Case, 'status' | 'ai_brief' | 'fact_check'>): CallPrep {
  if (c.status === 'pend_missing_info') {
    return {
      level: 'needs_info',
      line: 'We need one or two items from the provider — ask for them on this call.',
    };
  }
  const briefDone =
    c.ai_brief != null ||
    c.status === 'brief_ready' ||
    c.status === 'lpn_review' ||
    c.status === 'rn_review' ||
    c.status === 'md_review' ||
    c.status === 'determination_made' ||
    c.status === 'delivered';
  if (briefDone) {
    const score = c.fact_check?.overall_score;
    return {
      level: 'auth_prepared',
      line:
        score != null
          ? `Clinical brief is already prepared (fact-check ${score}) — this call is pure relationship.`
          : 'Clinical brief is already prepared — this call is pure relationship.',
    };
  }
  if (c.status === 'processing') {
    return {
      level: 'in_motion',
      line: 'Brief engine is working the clinicals now — you can promise a fast turnaround.',
    };
  }
  return {
    level: 'just_arrived',
    line: 'Just arrived — confirm receipt, set expectations, and flag anything unusual.',
  };
}

export interface ConciergePing {
  case_id: string;
  case_number: string;
  client_name: string | null;
  patient_name: string | null;
  procedure_description: string | null;
  status: Case['status'];
  priority: Case['priority'];
  intake_channel: string;
  channel_label: string;
  received_at: string;
  /** ISO time the first call should happen by. */
  callback_due_at: string;
  /** Minutes until the callback target; negative = past due. */
  minutes_to_target: number;
  overdue: boolean;
  prep: CallPrep;
}

type PingCase = Pick<
  Case,
  | 'id'
  | 'case_number'
  | 'created_at'
  | 'status'
  | 'priority'
  | 'patient_name'
  | 'procedure_description'
  | 'ai_brief'
  | 'fact_check'
> & {
  intake_channel?: string | null;
  client_name?: string | null;
};

/** Statuses where a first call is still meaningful. */
const PINGABLE_STATUSES: ReadonlyArray<Case['status']> = [
  'intake',
  'processing',
  'brief_ready',
  'lpn_review',
  'rn_review',
  'md_review',
  'pend_missing_info',
];

/**
 * Derive open pings: active cases with no outbound first-contact
 * touchpoint, most-overdue first.
 */
export function buildPings(
  cases: readonly PingCase[],
  touchpoints: readonly Pick<Touchpoint, 'case_id' | 'direction' | 'is_first_contact'>[],
  now: Date = new Date(),
): ConciergePing[] {
  const contacted = new Set(
    touchpoints
      .filter((t) => t.direction === 'outbound' && t.is_first_contact)
      .map((t) => t.case_id),
  );

  return cases
    .filter((c) => PINGABLE_STATUSES.includes(c.status) && !contacted.has(c.id))
    .map((c) => {
      const received = new Date(c.created_at);
      const due = new Date(received.getTime() + CALLBACK_TARGET_MINUTES * 60_000);
      const minutes_to_target = Math.round((due.getTime() - now.getTime()) / 60_000);
      return {
        case_id: c.id,
        case_number: c.case_number,
        client_name: c.client_name ?? null,
        patient_name: c.patient_name,
        procedure_description: c.procedure_description,
        status: c.status,
        priority: c.priority,
        intake_channel: c.intake_channel ?? 'batch_upload',
        channel_label: intakeChannelLabel(c.intake_channel),
        received_at: c.created_at,
        callback_due_at: due.toISOString(),
        minutes_to_target,
        overdue: minutes_to_target < 0,
        prep: buildCallPrep(c),
      };
    })
    .sort((a, b) => a.minutes_to_target - b.minutes_to_target);
}

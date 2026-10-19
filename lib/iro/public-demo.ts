import { INTAKE_REQUEST_KINDS, isOnIroQueue, routeIntake, type IntakeRequestKind } from '@/lib/lines/intake-router';
import { OHIO_SETTINGS_V1 } from './config/state-settings';
import { URAC_IRO_BASELINE } from './config/urac-baseline';
import { runSyntheticOhioWalkthrough } from './synthetic-ohio';
import type { DeadlineSpec } from './types';

export const IRO_PUBLIC_DEMO_LABEL = 'Demo, synthetic data';

const STAGE_IDS = ['intake', 'eligibility', 'assignment', 'review', 'signoff', 'notice'] as const;
export type IroPublicStageId = (typeof STAGE_IDS)[number];

export interface IroPublicStop {
  code: string;
  detail: string;
}

export interface IroPublicStage {
  id: IroPublicStageId;
  number: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  summary: string;
  points: readonly string[];
  stops: readonly IroPublicStop[];
}

export interface IroPublicFirewallRow {
  request: string;
  on_iro_queue: boolean;
  target: string;
  detail: string;
}

export interface IroPublicDemo {
  label: typeof IRO_PUBLIC_DEMO_LABEL;
  disclaimer: string;
  case_id: string;
  company: 'VANTA_HG';
  line: 'IRO';
  state_name: string;
  pathway: 'standard' | 'expedited';
  synthetic: true;
  closed: boolean;
  version: number;
  outcome: string;
  deadline: {
    clock_label: string;
    clock_at: string;
    ohio_standard: string;
    ohio_expedited: string;
    urac_standard: string;
    due_at: string;
    winner: string;
    missing_records: string;
    confirmed: false;
  };
  stages: readonly IroPublicStage[];
  firewall: readonly IroPublicFirewallRow[];
  billing_posted: boolean;
  billing_closes_case: false;
  billing_note: string;
}

const STOP_DETAIL: Record<string, string> = {
  wrong_step: 'The pathway cannot be set before intake. The case cannot skip ahead.',
  deadline_pause_forbidden: 'Missing records never pause or restart the deadline.',
  conflict_unresolved: 'A possible conflict is a hard STOP until a configured clearance role clears it.',
  conflict_clearance_denied: 'A coordinator cannot clear the conflict. Clearance is limited to a configured role.',
  records_need_team_lead: 'Missing records stop for the Team Lead. The due date does not move.',
  only_vanta_selects_reviewer: 'Only Vanta selects the reviewer. An outside selector is refused.',
  credential_expires_before_due: 'A credential that expires on or before the due date blocks assignment.',
  panel_not_activated: 'Assignment waits until every configured panel approval is recorded.',
  attestation_required: 'Records stay unreleased until Part A is signed and complete.',
  attestation_yes: 'Any yes on Part A is a hard STOP. Records stay unreleased.',
  process_check_required: 'The Medical Director cannot sign until the Team Lead process check passes on this version.',
  backdate_forbidden: 'Notice dates cannot be backdated.',
};

const STAGE_FOR_STOP: Record<string, IroPublicStageId> = {
  wrong_step: 'intake',
  deadline_pause_forbidden: 'intake',
  conflict_unresolved: 'eligibility',
  conflict_clearance_denied: 'eligibility',
  records_need_team_lead: 'eligibility',
  only_vanta_selects_reviewer: 'assignment',
  credential_expires_before_due: 'assignment',
  panel_not_activated: 'assignment',
  attestation_required: 'assignment',
  attestation_yes: 'assignment',
  process_check_required: 'signoff',
  backdate_forbidden: 'notice',
};

const REQUEST_LABEL: Record<IntakeRequestKind, string> = {
  iro: 'IRO',
  idre: 'IDRE',
  idr: 'IDR',
  um: 'UM',
  medical_review: 'Medical Review',
  internal_review: 'Internal review',
};

function durationLabel(spec: DeadlineSpec | null): string {
  if (!spec) return 'not configured';
  const unit =
    spec.unit === 'calendar_days'
      ? 'calendar days'
      : spec.unit === 'business_days'
        ? 'business days'
        : 'hours';
  return `${spec.duration} ${unit}`;
}

function targetLabel(target: string | null, onQueue: boolean): string {
  if (onQueue) return 'IRO queue';
  if (!target) return 'Out of IRO';
  if (target === 'MEDICAL_REVIEW') return 'Medical Review';
  return target;
}

function stopsFor(stage: IroPublicStageId, fired: readonly string[]): IroPublicStop[] {
  const seen = new Set<string>();
  const rows: IroPublicStop[] = [];
  for (const code of fired) {
    if (STAGE_FOR_STOP[code] !== stage || seen.has(code)) continue;
    const detail = STOP_DETAIL[code];
    if (!detail) {
      throw new Error(`public IRO demo has no safe copy for STOP ${code}`);
    }
    seen.add(code);
    rows.push({ code, detail });
  }
  return rows;
}

/**
 * Read-only view of the synthetic Ohio walkthrough.
 * Omits prices, person names, emails, and credential identifiers.
 */
export function buildIroPublicDemo(): IroPublicDemo {
  const run = runSyntheticOhioWalkthrough();
  const kase = run.case;
  const deadline = kase.deadline;
  if (!deadline) throw new Error('synthetic Ohio case has no deadline');
  if (kase.billing.events.some((event) => event.closes_case !== false)) {
    throw new Error('synthetic billing event must not close the case');
  }

  const fired = run.stops.filter((code) => STAGE_FOR_STOP[code]);
  const unexplained = run.stops.filter((code) => !STAGE_FOR_STOP[code]);
  if (unexplained.length > 0) {
    throw new Error(`public IRO demo does not map STOP ${unexplained.join(', ')}`);
  }

  const demo: IroPublicDemo = {
    label: IRO_PUBLIC_DEMO_LABEL,
    disclaimer:
      'Synthetic Ohio IRO walkthrough. Not a live case feed. No PHI. State rules on this page are preliminary and are not a legal confirmation.',
    case_id: kase.id,
    company: 'VANTA_HG',
    line: 'IRO',
    state_name: OHIO_SETTINGS_V1.state_name,
    pathway: kase.expedited ? 'expedited' : 'standard',
    synthetic: true,
    closed: kase.closure.closed,
    version: kase.version,
    outcome:
      kase.review?.outcome === 'overturned'
        ? `Overturned on version ${kase.version}. Version 1 was sealed after a failed check.`
        : 'Outcome is not the synthetic overturn path.',
    deadline: {
      clock_label: OHIO_SETTINGS_V1.clock_start_label,
      clock_at: deadline.clock_start_at,
      ohio_standard: durationLabel(OHIO_SETTINGS_V1.standard),
      ohio_expedited: durationLabel(OHIO_SETTINGS_V1.expedited),
      urac_standard: durationLabel(URAC_IRO_BASELINE.standard),
      due_at: deadline.due_at,
      winner: deadline.winner === 'state' ? 'Ohio state row' : deadline.winner,
      missing_records:
        deadline.missing_records_effect === 'none'
          ? 'Missing records do not move the due date.'
          : 'Missing-records effect is unexpected.',
      confirmed: false,
    },
    stages: [
      {
        id: 'intake',
        number: 1,
        title: 'Intake',
        summary: 'A synthetic Ohio request is logged, classified as medical necessity, and pinned to the standard pathway.',
        points: [
          `Case ${kase.id} on ${kase.company} / ${kase.line_of_business}. Arrival channel is a synthetic upload.`,
          'Classification is medical necessity, standard pathway, Ohio.',
          'The EMR adapter is not configured. Nothing is pulled from a live record system.',
          'IDR, IDRE, UM, Medical Review, and internal-review requests are routed out before they join this queue.',
        ],
        stops: stopsFor('intake', fired),
      },
      {
        id: 'eligibility',
        number: 2,
        title: 'Eligibility and conflict check',
        summary: 'A possible conflict stops the case. Clearance is a configured role, not the coordinator who logged it.',
        points: [
          'Parties on the check are synthetic tokens only. A prior Medical Review flag is stored as a flag, not another line’s case.',
          'The case is accepted with no benefit exclusion.',
          'Records are marked missing. The Team Lead releases that stop. The Ohio due date stays put.',
          'A referral form is generated from the pinned pathway and the synthetic review question.',
        ],
        stops: stopsFor('eligibility', fired),
      },
      {
        id: 'assignment',
        number: 3,
        title: 'Reviewer assignment',
        summary: 'Vanta assigns a synthetic reviewer only after credential status and panel activation both pass.',
        points: [
          'An outside selector is refused. An expired credential token is refused.',
          'The panel is inactive until every configured approval is recorded. Approver names are not shown here.',
          'Part A must be signed with every answer no. A yes answer blocks the record release.',
          'The notice later does not name the reviewer.',
        ],
        stops: stopsFor('assignment', fired),
      },
      {
        id: 'review',
        number: 4,
        title: 'Clinical review',
        summary: 'The physician completes a review. A failed check seals that version and steps the case back.',
        points: [
          'Version 1 review outcome was upheld, then a failed check sealed it.',
          `Version ${kase.version} review outcome is ${kase.review?.outcome ?? 'missing'}.`,
          'The case cannot skip from review to notice.',
        ],
        stops: stopsFor('review', fired),
      },
      {
        id: 'signoff',
        number: 5,
        title: 'Determination draft and human sign-off',
        summary: 'The draft cannot be signed until a person in the Team Lead role passes the process check.',
        points: [
          'Medical Director sign-off is a hard human gate on this version.',
          'The first sign-off attempt is refused because the process check has not passed.',
          'After the Team Lead process check, the Medical Director signs version 2.',
          'No machine sign-off is accepted in place of that signature.',
        ],
        stops: stopsFor('signoff', fired),
      },
      {
        id: 'notice',
        number: 6,
        title: 'Notice and close',
        summary: 'Notice is issued at the synthetic clock, delivered, and the case is closed. Billing does not close it.',
        points: [
          'A backdated notice is refused.',
          'The issued notice does not name the reviewer.',
          'Delivery is recorded as certified mail to a synthetic recipient token. The mailing adapter makes no live call.',
          kase.closure.closed ? 'The case is closed after delivery.' : 'The case is not closed.',
        ],
        stops: stopsFor('notice', fired),
      },
    ],
    firewall: INTAKE_REQUEST_KINDS.map((kind) => {
      const route = routeIntake(kind);
      const onQueue = isOnIroQueue(route);
      return {
        request: REQUEST_LABEL[kind],
        on_iro_queue: onQueue,
        target: targetLabel(route.target_line, onQueue),
        detail: route.reason,
      };
    }),
    billing_posted: kase.billing.events.length === 1,
    billing_closes_case: false,
    billing_note:
      'A billing event is recorded after closure. Posting does not close the case. Prices are not shown on this demo.',
  };

  assertPublicSafe(demo);
  return demo;
}

const FORBIDDEN =
  /\$|@|santana|johana|jonathan|jonah|\bSam\b|license_number|patient_name|member_id|display_total|amount_cents|1,700|170000/i;

function assertPublicSafe(demo: IroPublicDemo): void {
  const blob = JSON.stringify(demo);
  if (FORBIDDEN.test(blob)) {
    throw new Error('public IRO demo leaked a forbidden token');
  }
  if (demo.stages.length !== 6) {
    throw new Error('public IRO demo must show six stages');
  }
  if (demo.stages.some((stage, index) => stage.number !== index + 1 || stage.id !== STAGE_IDS[index])) {
    throw new Error('public IRO demo stages are out of order');
  }
  if (!demo.synthetic || demo.company !== 'VANTA_HG' || demo.line !== 'IRO') {
    throw new Error('public IRO demo left the synthetic IRO line');
  }
}

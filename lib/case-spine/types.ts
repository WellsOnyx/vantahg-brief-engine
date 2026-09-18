/**
 * Canonical case spine types from docs/customer-ready/04-case-object-and-views.md
 * and the 03 state machine / R01–R16 rule table.
 *
 * Existing `cases.status` / `cases.case_type` stay untouched (UM + IDR).
 * Spine fields live in additive columns and this module.
 */

export const AUTH_WORKFLOW_TYPES = ['prior_auth', 'first_level_appeal'] as const;
export type AuthWorkflowType = (typeof AUTH_WORKFLOW_TYPES)[number];

export const CASE_SPINE_STATES = [
  'received',
  'intake_validated',
  'intake_incomplete',
  'routed',
  'briefing',
  'awaiting_clinicals',
  'md_queue',
  'determined',
  'fanout_pending',
  'fanout_complete',
  'fanout_failed',
  'appeal_attached',
  'closed',
  'cancelled_by_client',
  'withdrawn',
] as const;
export type CaseSpineState = (typeof CASE_SPINE_STATES)[number];

export const TERMINAL_STATES: readonly CaseSpineState[] = [
  'closed',
  'cancelled_by_client',
  'withdrawn',
];

export const CASE_LANES = ['medical', 'pharmacy'] as const;
export type CaseLane = (typeof CASE_LANES)[number];

export const CASE_PRIORITIES = ['standard', 'urgent', 'expedited'] as const;
export type CaseSpinePriority = (typeof CASE_PRIORITIES)[number];

export const SLA_STATUSES = ['ok', 'at_risk', 'missed'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const SLA_CLOCKS = [
  'running',
  'paused',
  'stopped',
  'breached',
  'urgent',
  'n_a',
  'new_clock',
] as const;
export type SlaClock = (typeof SLA_CLOCKS)[number];

export const DETERMINATIONS = ['approve', 'deny', 'pend', 'partial'] as const;
export type SpineDetermination = (typeof DETERMINATIONS)[number];

export const FANOUT_STATUSES = [
  'not_started',
  'pending',
  'complete',
  'failed',
] as const;
export type FanoutStatus = (typeof FANOUT_STATUSES)[number];

export const CM_FLAGS = [
  'high_cost',
  'deny_with_alternative',
  'readmission_risk',
  'behavioral_health',
  'needs_discharge_planning',
  'appeals_in_flight',
] as const;
export type CmFlag = (typeof CM_FLAGS)[number];

export const AUTH_RULE_IDS = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R13',
  'R14',
  'R15',
  'R16',
] as const;
export type AuthRuleId = (typeof AUTH_RULE_IDS)[number];

export const SPINE_VIEW_ROLES = ['client', 'cx', 'med_review', 'superadmin'] as const;
export type SpineViewRole = (typeof SPINE_VIEW_ROLES)[number];

export interface ClientConfigSnapshot {
  client_id: string;
  sla_hours_standard: number;
  sla_hours_urgent: number;
  pharmacy_benefit?: boolean;
}

export const DEFAULT_CLIENT_CONFIG: Omit<ClientConfigSnapshot, 'client_id'> = {
  sla_hours_standard: 72,
  sla_hours_urgent: 24,
  pharmacy_benefit: false,
};

/** Synthetic intake payload — tokenized refs only, never live PHI. */
export interface IntakePayload {
  external_id?: string | null;
  member_ref?: string | null;
  requesting_provider?: string | null;
  service_or_rx?: string | null;
  place_of_service?: string | null;
  urgency?: CaseSpinePriority | null;
  clinicals_pointer?: string | null;
  received_at?: string | null;
  benefit_type?: 'medical' | 'pharmacy' | 'drug' | null;
}

export interface CanonicalCase {
  case_id: string;
  case_number: string;
  client_id: string;
  external_id: string | null;
  type: AuthWorkflowType;
  state: CaseSpineState;
  lane: CaseLane | null;
  priority: CaseSpinePriority;
  sla_due_at: string | null;
  sla_status: SlaStatus;
  sla_clock: SlaClock;
  sla_paused_at: string | null;
  received_at: string;
  determined_at: string | null;
  determination: SpineDetermination | null;
  signer_id: string | null;
  brief_id: string | null;
  packet_storage_keys: string[];
  parent_case_id: string | null;
  billable_event_id: string | null;
  fanout_status: FanoutStatus;
  cm_flags: CmFlag[];
  audit_cursor: number;
  open_tasks: string[];
  duplicate_of_case_id: string | null;
  intake: IntakePayload;
}

export interface AuditEvent {
  event_id: string;
  case_id: string | null;
  at: string;
  actor: string;
  rule_id: AuthRuleId | null;
  from_state: CaseSpineState | null;
  to_state: CaseSpineState | null;
  note: string;
  payload_hash: string;
}

export interface AuthRuleEffects {
  set_state?: CaseSpineState;
  set_lane?: CaseLane;
  set_priority?: CaseSpinePriority;
  set_sla_clock?: SlaClock;
  set_sla_status?: SlaStatus;
  add_task?: string;
  notify?: string[];
  link_duplicate?: boolean;
  enqueue_fanout?: boolean;
  create_billable_event?: boolean;
  attach_cm_flags?: boolean;
  start_new_clock?: boolean;
}

export interface AuthRule {
  rule_id: AuthRuleId;
  version: number;
  enabled: boolean;
  sort_order: number;
  when_text: string;
  then_text: string;
  sla_clock: SlaClock;
  effects: AuthRuleEffects;
}

export interface RuleEvalContext {
  benefit_type?: 'medical' | 'pharmacy' | 'drug' | null;
  clinicals_received?: boolean;
  is_duplicate?: boolean;
  duplicate_of_case_id?: string;
  urgent?: boolean;
  criteria_result?: 'meet' | 'fail' | 'gray' | null;
  sla_elapsed_ratio?: number;
  md_signed?: boolean;
  signer_id?: string;
  inbound_is_appeal?: boolean;
  parent_case_id?: string;
  client_cancel?: boolean;
  client_withdraw?: boolean;
  cm_flags?: CmFlag[];
  client_config?: Partial<ClientConfigSnapshot>;
}

export interface RuleEvaluation {
  rule_id: AuthRuleId;
  matched: boolean;
  skipped_disabled: boolean;
  version: number;
  sla_clock: SlaClock;
  note: string;
}

export interface CreateCaseInput {
  client_id: string;
  type?: AuthWorkflowType;
  external_id?: string | null;
  priority?: CaseSpinePriority;
  parent_case_id?: string | null;
  packet_storage_keys?: string[];
  intake?: IntakePayload;
  client_config?: Partial<ClientConfigSnapshot>;
}

export interface TransitionInput {
  to_state: CaseSpineState;
  determination?: SpineDetermination | null;
  signer_id?: string | null;
  brief_id?: string | null;
  billable_event_id?: string | null;
  fanout_status?: FanoutStatus;
  cm_flags?: CmFlag[];
  note?: string;
}

export interface ListCasesFilters {
  client_id?: string;
  state?: CaseSpineState;
  lane?: CaseLane;
  sla_status?: SlaStatus;
  type?: AuthWorkflowType;
}

export interface SpineViewer {
  id: string;
  role: SpineViewRole;
  client_id?: string | null;
}

export class IllegalTransitionError extends Error {
  readonly code = 'illegal_transition' as const;
  constructor(
    readonly from_state: CaseSpineState,
    readonly to_state: CaseSpineState,
  ) {
    super(`Illegal case-spine transition: ${from_state} → ${to_state}`);
    this.name = 'IllegalTransitionError';
  }
}

export class CaseNotFoundError extends Error {
  readonly code = 'case_not_found' as const;
  constructor(readonly case_id: string) {
    super(`Case not found: ${case_id}`);
    this.name = 'CaseNotFoundError';
  }
}

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

export const CRITERIA_RESULTS = ['meet', 'fail', 'gray'] as const;
export type CriteriaResult = (typeof CRITERIA_RESULTS)[number];

export const BRIEF_SOURCES = ['synthetic', 'existing_api'] as const;
export type BriefSource = (typeof BRIEF_SOURCES)[number];

export const SIGN_ERROR_CODES = [
  'brief_required',
  'md_sign_required',
  'not_in_md_queue',
  'rationale_required',
  'invalid_determination',
  'already_signed',
] as const;
export type SignErrorCode = (typeof SIGN_ERROR_CODES)[number];

/** Tokenized / synthetic brief — AIBrief-compatible, no live PHI. */
export interface SpineBriefContent {
  clinical_question: string;
  patient_summary: string;
  diagnosis_analysis: {
    primary_diagnosis: string;
    secondary_diagnoses: string[];
    diagnosis_procedure_alignment: string;
  };
  procedure_analysis: {
    codes: string[];
    clinical_rationale: string;
    complexity_level: 'routine' | 'moderate' | 'complex';
    setting_appropriateness: string;
  };
  criteria_match: {
    guideline_source: string;
    applicable_guideline: string;
    criteria_met: string[];
    criteria_not_met: string[];
    criteria_unable_to_assess: string[];
    conservative_alternatives: string[];
  };
  documentation_review: {
    documents_provided: string;
    key_findings: string[];
    missing_documentation: string[];
  };
  ai_recommendation: {
    recommendation: 'approve' | 'deny' | 'pend' | 'peer_to_peer_recommended';
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
    key_considerations: string[];
    if_modify_suggestion: string | null;
  };
  reviewer_action: {
    decision_required: string;
    time_sensitivity: string;
    peer_to_peer_suggested: boolean;
    additional_info_needed: string[];
    state_specific_requirements: string[];
  };
}

export interface SpineBrief {
  brief_id: string;
  case_id: string;
  source: BriefSource;
  /** Existing /api/generate-brief or demo case id, when source=existing_api. */
  existing_brief_ref: string | null;
  created_at: string;
  draft_determination: SpineDetermination;
  criteria_result: CriteriaResult;
  content: SpineBriefContent;
  content_hash: string;
}

export interface FanoutStub {
  enqueued_at: string;
  status: 'pending';
  targets: string[];
}

export interface BillableEventStub {
  billable_event_id: string;
  event: 'determination.signed';
  enqueued_at: string;
}

export interface EvidenceManifest {
  packet_storage_keys: string[];
  hashes: Record<string, string>;
}

export interface DeterminationPackage {
  version: number;
  case_id: string;
  storage_key: string;
  brief_id: string;
  brief_hash: string;
  determination: SpineDetermination;
  rationale: string;
  letter_html: string;
  evidence_manifest: EvidenceManifest;
  signer_id: string;
  signed_at: string;
  session_refs: {
    actor: string;
    ip: string | null;
    request_id: string | null;
  };
  criteria_snapshot: SpineBriefContent['criteria_match'] | null;
  cm_flags: CmFlag[];
  fanout_enqueued: true;
  billable_event_id: string;
  immutable: true;
  content_hash: string;
  previous_version: number | null;
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
  signed_rationale: string | null;
  determination_package_version: number | null;
  determination_package_key: string | null;
  fanout_stub: FanoutStub | null;
  billable_event_stub: BillableEventStub | null;
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
  criteria_result?: CriteriaResult | null;
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

export interface AttachBriefInput {
  brief_id?: string | null;
  /** Existing generate-brief / demo case id — copies that brief, does not regenerate. */
  source_case_id?: string | null;
  criteria_result?: CriteriaResult;
  enqueue_md?: boolean;
}

export interface SignDeterminationInput {
  determination: SpineDetermination;
  rationale: string;
  cm_flags?: CmFlag[];
  session_refs?: {
    ip?: string | null;
    request_id?: string | null;
  };
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

export class BriefRequiredError extends Error {
  readonly code = 'brief_required' as const;
  constructor(
    readonly case_id: string,
    readonly attempted_state: CaseSpineState,
  ) {
    super(`Brief must be attached before ${attempted_state} (case ${case_id})`);
    this.name = 'BriefRequiredError';
  }
}

export class IllegalSignError extends Error {
  constructor(
    readonly code: SignErrorCode,
    message: string,
    readonly case_id?: string,
  ) {
    super(message);
    this.name = 'IllegalSignError';
  }
}

export class PackageImmutableError extends Error {
  readonly code = 'package_immutable' as const;
  constructor(
    readonly case_id: string,
    readonly version: number,
  ) {
    super(`Determination package already written: ${case_id} v${version}`);
    this.name = 'PackageImmutableError';
  }
}

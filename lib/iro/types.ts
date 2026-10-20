import type { LineOfBusiness } from '@/lib/lines/types';

export const IRO_STATE_CODES = [
  'OH',
  'NC',
  'MI',
  'VA',
  'SD',
  'NE',
  'OK',
  'IL',
  'TN',
  'CO',
] as const;
export type IroStateCode = (typeof IRO_STATE_CODES)[number];

export const IRO_STEPS = [
  'intake',
  'classification',
  'pathway_deadline',
  'conflict_check',
  'acceptance',
  'records',
  'referral',
  'reviewer_assignment',
  'attestation_gate',
  'review',
  'md_signoff',
  'notice',
  'delivery',
  'closure',
  'billing',
] as const;
export type IroStep = (typeof IRO_STEPS)[number];

export type IroStage = 1 | 2 | 3 | 4 | 5 | 6;

export const IRO_ROLES = [
  'iro_coordinator',
  'iro_team_lead',
  'iro_physician',
  'iro_medical_director',
] as const;
export type IroRole = (typeof IRO_ROLES)[number];

export type DeadlineUnit = 'hours' | 'calendar_days' | 'business_days';

export interface DeadlineSpec {
  duration: number;
  unit: DeadlineUnit;
}

export type ClockStart = 'carrier_receipt' | 'state_receipt' | 'vanta_receipt';

export type ReviewCategory =
  | 'medical_necessity'
  | 'experimental_investigational'
  | 'administrative_legal'
  | 'combined';

export type MisrouteCategory = 'idre' | 'um' | 'medical_review' | 'internal_review';

export type IroClassification = ReviewCategory | MisrouteCategory;

export type FeeChargeKey =
  | 'standard'
  | 'expedited'
  | 'standard_ei'
  | 'expedited_ei'
  | 'early_closure'
  | 'additional_specialist';

export interface FeeChargeDefinition {
  code: string;
  amount_cents: number;
}

/** Effective-dated fee configuration. Preliminary until an owner confirms it. */
export interface FeeSchedule {
  id: string;
  preliminary: true;
  effective_from: string;
  effective_to: string | null;
  approved_by: string | null;
  change_note: string;
  charges: Record<FeeChargeKey, FeeChargeDefinition>;
}

export interface StateSettingsVersion {
  id: string;
  state: IroStateCode;
  state_name: string;
  version: number;
  preliminary: true;
  confirmed: boolean;
  go_live: boolean;
  effective_from: string;
  effective_to: string | null;
  approved_by: string | null;
  change_note: string;
  clock_start: ClockStart | null;
  /** Human label, e.g. Ohio "health plan receipt" stored in the carrier timestamp. */
  clock_start_label: string;
  standard: DeadlineSpec | null;
  expedited: DeadlineSpec | null;
  /** YYYY-MM-DD dates skipped when the spec unit is business_days. */
  holidays: readonly string[];
  patient_billing: 'allowed' | 'prohibited';
  early_closure_permitted: boolean;
  additional_specialist_permitted: boolean;
  fee_cap_cents: number | null;
  fee_overrides: Partial<Record<FeeChargeKey, number>>;
  notices: readonly string[];
  recipients: readonly string[];
  reporting_notes: readonly string[];
  decision_model: 'iro_decides' | 'state_decides' | null;
  new_info_to_carrier_business_days: number | null;
  phone_24_7_required: boolean;
  assignment_by_state: boolean;
}

export interface StateSettingsRegistry {
  versions: readonly StateSettingsVersion[];
}

export interface Receipts {
  carrier_receipt_at: string | null;
  state_receipt_at: string | null;
  vanta_receipt_at: string | null;
}

export type DeadlineWinner = 'state' | 'urac' | 'contract' | 'tie';

export interface DeadlineResult {
  due_at: string;
  clock_start: ClockStart;
  clock_start_at: string;
  state_due_at: string | null;
  urac_due_at: string;
  contract_due_at: string | null;
  winner: DeadlineWinner;
  pinned_settings_id: string;
  urac_baseline_id: string;
  /** Applied spec copied onto the case so a later config edit cannot move it. */
  applied: DeadlineSpec;
  applied_source: 'state' | 'urac' | 'contract';
  missing_records_effect: 'none';
  reviewer_due_at: string;
  team_lead_alert: 'pathway_too_short' | null;
}

export type IroActionType =
  | 'log_intake'
  | 'classify'
  | 'set_pathway_deadline'
  | 'record_conflict_check'
  | 'clear_conflict'
  | 'accept_case'
  | 'log_records'
  | 'generate_referral'
  | 'assign_reviewer'
  | 'submit_attestation'
  | 'release_records'
  | 'complete_review'
  | 'fail_check'
  | 'team_lead_process_check'
  | 'md_signoff'
  | 'issue_notice'
  | 'record_delivery'
  | 'close_case'
  | 'record_billing'
  | 'revise_after_approval'
  | 'pause_deadline';

export interface IroAccessPolicy {
  id: string;
  conflict_clearance_roles: readonly string[];
  panel_approvers: readonly string[];
  stage_actors: Record<IroStage, readonly IroRole[]>;
  action_roles: Record<Exclude<IroActionType, 'clear_conflict' | 'fail_check'>, readonly IroRole[]>;
}

export interface IroActor {
  id: string;
  role: IroRole;
  companies: readonly string[];
  lines: readonly LineOfBusiness[];
  case_restricted: boolean;
  assigned_case_ids: readonly string[];
  line_wide: boolean;
  /** Who may choose the reviewer. Only `vanta` is accepted. */
  selector: 'vanta' | 'external' | 'plan' | 'vendor';
  /** Configurable clearance id, compared to the policy list. Null if none. */
  clearance_role: string | null;
}

export const PART_A_QUESTIONS = [
  'financial_conflict',
  'familial_conflict',
  'treating_relationship',
  'credential_concern',
] as const;
export type PartAQuestion = (typeof PART_A_QUESTIONS)[number];
export type PartAAnswer = 'yes' | 'no' | '';

export interface PartAAttestation {
  signed: boolean;
  signed_at: string | null;
  answers: Record<PartAQuestion, PartAAnswer>;
  passed: boolean;
}

export interface CaseDocument {
  ref: string;
  pages: number;
  readable: boolean;
}

export interface ReferralForm {
  case_id: string;
  category: ReviewCategory;
  expedited: boolean;
  state_code: IroStateCode;
  pathway: 'standard' | 'expedited';
  review_question: string;
  document_count: number;
  page_count: number;
  reviewer_due_at: string;
  conflict_parties: readonly string[];
}

export type ReviewOutcome = 'upheld' | 'overturned' | 'partially_overturned';

export interface FeeLine {
  code: string;
  description: string;
  amount_cents: number;
  permitted: boolean;
  flag: 'may_not_be_permitted' | null;
}

export interface FeeQuote {
  preliminary: true;
  schedule_id: string;
  state: IroStateCode;
  state_rule_confirmed: boolean;
  lines: FeeLine[];
  /** Full amount shown before confirmation, including flagged add-ons. */
  display_total_cents: number;
  display_total: string;
  /** Lines that are allowed to post. Flagged lines are left out. */
  billable_total_cents: number;
  patient_billing_blocked: boolean;
  exceeds_cap: boolean;
  flags: readonly string[];
  billable: boolean;
}

export interface BillingEvent {
  id: string;
  at: string;
  quote_schedule_id: string;
  amount_cents: number;
  /** Closure is a different flag. Posting never sets it. */
  closes_case: false;
}

export interface SealedSnapshot {
  version: number;
  step: IroStep;
  original_request_ref: string | null;
  deadline_due_at: string | null;
  attestation_passed: boolean;
  records_released: number | null;
  review_outcome: ReviewOutcome | null;
  md_signed: boolean;
}

export interface SealedVersion {
  version: number;
  reason: 'failed_check' | 'post_approval_change';
  sealed_at: string;
  detail: string;
  snapshot: SealedSnapshot;
}

export interface CaseAuditEvent {
  at: string;
  actor_id: string;
  action: string;
  code: string;
  step: IroStep;
  version: number;
}

export interface IroCase {
  id: string;
  company: 'VANTA_HG';
  line_of_business: 'IRO';
  /** False on records opened through the production portal. */
  synthetic: boolean;
  version: number;
  step: IroStep;
  status: 'active' | 'stopped' | 'routed_out';
  stop: { code: string; message: string; step: IroStep } | null;
  receipts: Receipts;
  timezone: string | null;
  arrival_channel: string | null;
  referring_entity_ref: string | null;
  original_request_ref: string | null;
  duplicate: boolean;
  review_question: string | null;
  category: IroClassification | null;
  expedited: boolean;
  state_code: IroStateCode;
  pinned_settings_id: string | null;
  pinned_fee_schedule_id: string | null;
  deadline: DeadlineResult | null;
  conflict: {
    possible: boolean;
    cleared: boolean;
    cleared_by_role: string | null;
    parties: readonly string[];
    /** Prior-line involvement flag only. Never another line's case body. */
    prior_line_flags: readonly LineOfBusiness[];
  } | null;
  acceptance: { benefit_exclusion: boolean } | null;
  records: {
    documents: CaseDocument[];
    missing: boolean;
    page_count: number;
    released_on_version: number | null;
  };
  referral: ReferralForm | null;
  reviewer_id: string | null;
  reviewer_selected_by: 'vanta' | null;
  attestation: PartAAttestation | null;
  review: { outcome: ReviewOutcome; completed_on_version: number } | null;
  process_check: { version: number; actor_id: string; passed: boolean } | null;
  md_signoff: { version: number; actor_id: string; at: string } | null;
  notice: {
    version: number;
    outcome: ReviewOutcome;
    at: string;
    reviewer_named: false;
    consumer_assistance: readonly string[];
  } | null;
  delivery: {
    state: 'pending' | 'delivered' | 'failed';
    channel: 'regular' | 'certified' | null;
    at: string | null;
  };
  closure: { closed: boolean; at: string | null };
  billing: { quote: FeeQuote | null; events: BillingEvent[] };
  versions: SealedVersion[];
  audit: CaseAuditEvent[];
}

export interface CredentialStatus {
  physician_id: string;
  active: boolean;
  specialty_codes: readonly string[];
  licensed_states: readonly string[];
  board_certified: boolean;
  expires_at: string | null;
  lines_of_business: readonly LineOfBusiness[];
}

export interface PanelApproval {
  approver_role: string;
  recorded_at: string;
  recorded: boolean;
}

export interface PanelActivation {
  physician_id: string;
  approvals: readonly PanelApproval[];
}

export interface IroSuccess {
  ok: true;
  case: IroCase;
}

export interface IroFailure {
  ok: false;
  code: string;
  message: string;
  case: IroCase;
}

export type IroOutcome = IroSuccess | IroFailure;

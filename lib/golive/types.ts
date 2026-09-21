import type { AuthWorkflowType, CaseSpineState, CriteriaResult, SlaClock } from '@/lib/case-spine';

export const PACK_SCENARIOS = ['happy_path', 'missing_clinicals', 'gray_zone'] as const;
export type PackScenario = (typeof PACK_SCENARIOS)[number];

export const MIN_SYNTHETIC_PACK = 10;
export const MIN_SHADOW_PACK = 10;

export const GO_LIVE_LOG_KINDS = [
  'gate',
  'pack',
  'shadow',
  'live',
  'rollback',
  'note',
  'secrets',
] as const;
export type GoLiveLogKind = (typeof GO_LIVE_LOG_KINDS)[number];

export interface PackCaseSpec {
  id: string;
  scenario: PackScenario;
  label: string;
  /** Catalog + per-case flag. Shadow cases never write live PHI or final-send. */
  shadow?: boolean;
  /** prior_auth | first_level_appeal — defaults to prior_auth. */
  type?: AuthWorkflowType;
  /** Resolve against an earlier fixture's intake.external_id (appeals). */
  parent_external_id?: string;
  /** Tokenized refs only. */
  intake: {
    external_id: string;
    member_ref?: string | null;
    requesting_provider?: string | null;
    service_or_rx?: string | null;
    place_of_service?: string | null;
    urgency?: 'standard' | 'urgent' | 'expedited' | null;
    clinicals_pointer?: string | null;
    benefit_type?: 'medical' | 'pharmacy' | 'drug' | null;
  };
  source?: 'spine' | 'gravity_rail' | 'external_api' | 'fax_phaxio';
  criteria?: CriteriaResult;
  sign?: boolean;
  determination?: 'approve' | 'deny' | 'pend' | 'partial';
  expected: {
    state: CaseSpineState;
    sla_clock?: SlaClock;
    criteria_result?: CriteriaResult;
    type?: AuthWorkflowType;
  };
}

export interface PackCaseResult {
  spec_id: string;
  scenario: PackScenario;
  case_id: string | null;
  ok: boolean;
  expected_state: CaseSpineState;
  actual_state: CaseSpineState | null;
  sla_clock: SlaClock | null;
  criteria_result: CriteriaResult | null;
  signed: boolean;
  error: string | null;
  via: 'case-spine' | 'intake';
}

export interface PackRunResult {
  pack: 'synthetic' | 'shadow';
  client_id: string;
  passed: boolean;
  count: number;
  required: number;
  happy_path: number;
  missing_clinicals: number;
  gray_zone: number;
  signed: number;
  cases: PackCaseResult[];
  shadow_mode: boolean;
  member_provider_final_sends: number;
  ran_at: string;
}

export interface GoLiveLogEntry {
  entry_id: string;
  client_id: string;
  at: string;
  actor: string;
  kind: GoLiveLogKind;
  message: string;
  payload?: Record<string, unknown>;
}

export interface LiveHypercareEvaluation {
  client_id: string;
  sample_size: number;
  sample_target: number;
  missed: number;
  miss_rate: number;
  threshold: number;
  breached: boolean;
  action: 'hold' | 'rollback_to_shadow';
  note: string;
  evaluated_at: string;
}

export interface GoLiveStatus {
  client_id: string;
  go_live_mode: 'synthetic' | 'shadow' | 'live';
  shadow_mode: boolean;
  threshold: number;
  log: GoLiveLogEntry[];
  last_synthetic: PackRunResult | null;
  last_shadow: PackRunResult | null;
  hypercare: LiveHypercareEvaluation | null;
}

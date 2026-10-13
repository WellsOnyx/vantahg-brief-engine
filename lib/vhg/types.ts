/**
 * Synthetic VHG Score demo types.
 * No live PHI. Raw IDR rows exist only so redaction tests can prove
 * direct identifiers are stripped before anything is scored or shown.
 */

export const FACILITY_TYPES = ['hospital', 'asc', 'office', 'freestanding_er'] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const ENCOUNTERS = ['emergency', 'scheduled'] as const;
export type Encounter = (typeof ENCOUNTERS)[number];

export const NETWORK_STATUSES = ['in_network', 'out_of_network'] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

export const IDR_OUTCOMES = ['provider_win', 'payer_win', 'settled'] as const;
export type IdrOutcome = (typeof IDR_OUTCOMES)[number];

export const VHG_BANDS = ['low', 'medium', 'high'] as const;
export type VhgBand = (typeof VHG_BANDS)[number];

/** Identifiable synthetic IDR filing. Never sent to the UI or the score lookup. */
export interface SyntheticIdrRecord {
  source_record_id: string;
  patient_name: string;
  date_of_birth: string;
  member_id: string;
  street: string;
  city: string;
  postal_code: string;
  provider_person_name: string;
  provider_npi: string;
  claim_number: string;
  service_date: string;
  dispute_opened_date: string;
  network_status: NetworkStatus;
  specialty: string;
  cpt: string;
  service_line: string;
  billed_amount: number;
  qpa_amount: number;
  state: string;
  facility_type: FacilityType;
  encounter: Encounter;
  idr_outcome: IdrOutcome;
  initiating_party: 'provider' | 'plan';
}

/** HIPAA Safe Harbor-style aggregate pattern. Month/year only. No direct identifiers. */
export interface RedactedIdrPattern {
  pattern_id: string;
  service_month: string;
  dispute_month: string;
  network_status: NetworkStatus;
  specialty: string;
  cpt: string;
  service_line: string;
  billed_to_qpa_ratio: number;
  state: string;
  facility_type: FacilityType;
  encounter: Encounter;
  idr_outcome: IdrOutcome;
  initiating_party: 'provider' | 'plan';
}

export interface VhgScoreInput {
  network_status: NetworkStatus;
  specialty: string;
  cpt: string;
  service_line: string;
  billed_amount: number;
  qpa_amount: number;
  state: string;
  facility_type: FacilityType;
  encounter: Encounter;
}

export interface VhgScoreDriver {
  key: string;
  label: string;
  direction: 'increases' | 'decreases';
  /** Signed change in the 0–100 score when this feature is included. */
  points: number;
  detail: string;
}

export interface VhgPatternLookup {
  match_level: 'service_line_state_network_encounter' | 'service_line_network' | 'none';
  sample_size: number;
  provider_wins: number;
  payer_wins: number;
  settled: number;
  provider_win_rate: number | null;
}

export interface VhgScore {
  score: number;
  band: VhgBand;
  drivers: VhgScoreDriver[];
  pattern_lookup: VhgPatternLookup;
  model_id: 'vhg-score-demo-v1';
  model_status: 'demo_not_validated';
  /** Display brand, always `VHG™ Score` from `VHG_SCORE_LABEL`. */
  label: string;
  trademark: 'TM';
  advisory: string;
}

export interface DemoCriteriaItem {
  status: 'met' | 'not_met' | 'not_assessed';
  text: string;
}

export interface DemoCriteriaResult {
  label: 'criteria result (demo)';
  source_note: string;
  result: 'meet' | 'partial' | 'not_meet';
  headline: string;
  items: DemoCriteriaItem[];
}

export interface MedReviewDemoCase {
  case_token: string;
  case_number: string;
  client_id: string;
  service_month: string;
  member_token: string;
  summary: string;
  service_line: string;
  specialty: string;
  cpt: string;
  state: string;
  facility_type: FacilityType;
  encounter: Encounter;
  network_status: NetworkStatus;
  billed_amount: number;
  qpa_amount: number;
}

export interface MedReviewPanel {
  illustrative: boolean;
  illustrative_note: string | null;
  case_token: string;
  case_number: string;
  service_month: string;
  member_token: string;
  summary: string;
  service_line: string;
  specialty: string;
  cpt: string;
  state: string;
  facility_type: FacilityType;
  encounter: Encounter;
  network_status: NetworkStatus;
  billed_amount: number;
  qpa_amount: number;
  billed_to_qpa_ratio: number;
  criteria: DemoCriteriaResult;
  score: VhgScore;
}

export const VHG_SCORE_ADVISORY =
  'Advisory only. The doctor decides. This score does not determine medical necessity and does not file an IDR dispute.';

export const VHG_BANNER = 'Included at no charge with Vanta Med Review';

export const CRITERIA_SOURCE_NOTE =
  'Placeholder only. This is not InterQual, MCG, or any other licensed criteria product.';

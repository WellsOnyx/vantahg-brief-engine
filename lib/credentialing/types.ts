/**
 * Shared reviewer credentialing.
 * One record per reviewer. IRO, Medical Review, and Sagility read it.
 * Sagility is a credential consumer. It is not a case line.
 * Case lines stay IDR, IRO, and MEDICAL_REVIEW in lib/lines.
 */

export const CREDENTIAL_LINES = ['IRO', 'MEDICAL_REVIEW', 'SAGILITY'] as const;
export type CredentialLine = (typeof CREDENTIAL_LINES)[number];

export const CREDENTIAL_ITEM_KINDS = [
  'license',
  'board_certification',
  'sanctions_screen',
  'agreement',
] as const;
export type CredentialItemKind = (typeof CREDENTIAL_ITEM_KINDS)[number];

export const CREDENTIAL_ITEM_STATUSES = ['active', 'expired', 'lapsed', 'restricted'] as const;
export type CredentialItemStatus = (typeof CREDENTIAL_ITEM_STATUSES)[number];

/** Decision (f) is open. Callers name the source on each item. There is no default. */
export const ATTESTATION_SOURCES = ['vanta_verified', 'vendor_attested'] as const;
export type AttestationSource = (typeof ATTESTATION_SOURCES)[number];

export interface CredentialItem {
  id: string;
  kind: CredentialItemKind;
  /** Synthetic label. Not a license number. */
  label: string;
  state_code: string | null;
  specialty_code: string | null;
  status: CredentialItemStatus;
  expires_at: string | null;
  source: AttestationSource;
  /** Set only when source is vendor_attested. Not a selected vendor. */
  vendor_ref: string | null;
  attested_at: string;
}

export interface SharedCredentialRecord {
  reviewer_id: string;
  /** Synthetic token. Not a legal name. */
  display_token: string;
  items: readonly CredentialItem[];
  created_at: string;
  updated_at: string;
}

export interface CredentialItemInput {
  reviewer_id: string;
  display_token: string;
  item_id: string;
  kind: CredentialItemKind;
  label: string;
  state_code: string | null;
  specialty_code: string | null;
  status: CredentialItemStatus;
  expires_at: string | null;
  source: AttestationSource;
  vendor_ref: string | null;
}

export interface IroApproval {
  approver_id: string;
  recorded_at: string;
}

/** IRO panel activation. Medical Review and Sagility do not store a counted panel here. */
export interface IroActivation {
  reviewer_id: string;
  line: 'IRO';
  approvals: readonly IroApproval[];
}

export interface CredentialAuditEvent {
  type:
    | 'credential_item_recorded'
    | 'credential_write_refused'
    | 'iro_activation_decision'
    | 'credential_assignment_denied';
  at: string;
  reviewer_id: string | null;
  line: CredentialLine | null;
  approver_id: string | null;
  code: string;
  source: AttestationSource | null;
  item_kind: CredentialItemKind | null;
}

export interface CredentialingState {
  records: readonly SharedCredentialRecord[];
  activations: readonly IroActivation[];
  audit: readonly CredentialAuditEvent[];
}

/** Portal read. License numbers, vendor refs, and case bodies are not on this view. */
export interface SharedCredentialView {
  reviewer_id: string;
  active: boolean;
  specialty_codes: readonly string[];
  licensed_states: readonly string[];
  board_certified: boolean;
  expires_at: string | null;
  sources: readonly AttestationSource[];
  item_ids: readonly string[];
}

export interface AssignmentAllowed {
  ok: true;
  state: CredentialingState;
  code: 'assignable';
  line: CredentialLine;
  reviewer_id: string;
  activation: 'iro_panel' | 'delegated';
  sources: readonly AttestationSource[];
}

export interface AssignmentDenied {
  ok: false;
  state: CredentialingState;
  code: string;
  message: string;
  line: CredentialLine;
  reviewer_id: string;
  missing_approver_ids: readonly string[];
}

export type AssignmentEvaluation = AssignmentAllowed | AssignmentDenied;

export interface CredentialAccepted<T> {
  ok: true;
  state: CredentialingState;
  value: T;
}

export interface CredentialDenied {
  ok: false;
  state: CredentialingState;
  code: string;
  message: string;
}

export type CredentialMutation<T> = CredentialAccepted<T> | CredentialDenied;

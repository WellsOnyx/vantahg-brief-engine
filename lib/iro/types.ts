export const IRO_PANEL_STATUSES = [
  'applicant',
  'in_verification',
  'pending_clinical_approval',
  'approved',
  'conditional',
  'denied',
  'suspended',
  'expired',
] as const;
export type IroPanelStatus = (typeof IRO_PANEL_STATUSES)[number];

export const IRO_AVAILABILITY = ['available', 'limited', 'unavailable'] as const;
export type IroAvailability = (typeof IRO_AVAILABILITY)[number];

export const IRO_ASSIGNMENT_STATUSES = [
  'unassigned',
  'assignable',
  'on_case',
  'hold',
] as const;
export type IroAssignmentStatus = (typeof IRO_ASSIGNMENT_STATUSES)[number];

export const SCREENING_SOURCES = ['oig_leie', 'sam', 'npdb', 'state_board'] as const;
export type ScreeningSource = (typeof SCREENING_SOURCES)[number];

export const REQUIRED_SCREENING_SOURCES = ['oig_leie', 'sam'] as const;

export const AGREEMENT_TYPES = [
  'confidentiality',
  'conflict_policy',
  'panel_participation',
  'hipaa_ack',
] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const REQUIRED_AGREEMENTS: readonly AgreementType[] = [
  'confidentiality',
  'conflict_policy',
  'panel_participation',
];

export const EVIDENCE_KINDS = [
  'cv',
  'license',
  'sanction',
  'agreement',
  'contract',
  'other',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const CREDENTIAL_EVENT_TYPES = [
  'change',
  'finding',
  'follow_up',
  'corrective_action',
  'status_transition',
  'reminder',
] as const;
export type CredentialEventType = (typeof CREDENTIAL_EVENT_TYPES)[number];

export interface IroLicense {
  id: string;
  state: string;
  license_number: string;
  expires_on: string;
  status: 'active' | 'expired' | 'restricted';
  primary_source_verified_at: string | null;
  primary_source_method: string | null;
  primary_source_result: 'clear' | 'hit' | 'inconclusive' | null;
  evidence_storage_key: string | null;
}

export interface IroBoardCert {
  id: string;
  board_name: string;
  specialty: string;
  certified_on: string | null;
  expires_on: string | null;
  status: 'active' | 'expired' | 'waived';
  evidence_storage_key: string | null;
}

export interface IroSanction {
  id: string;
  source: ScreeningSource;
  screened_at: string;
  result: 'clear' | 'hit' | 'inconclusive';
  finding_summary: string;
  evidence_storage_key: string | null;
  /** Stub adapters set this false. Live OIG/SAM calls are out of scope. */
  live_call: false;
}

export interface IroExperience {
  id: string;
  setting: string;
  role_title: string;
  specialty: string;
  started_on: string;
  ended_on: string | null;
  direct_patient_care: boolean;
  recency_note: string | null;
}

export interface IroAgreement {
  id: string;
  agreement_type: AgreementType;
  title: string;
  status: 'outstanding' | 'acknowledged' | 'expired';
  acknowledged_at: string | null;
  evidence_storage_key: string | null;
  evidence_link: string | null;
}

export interface IroOutstandingItem {
  id: string;
  label: string;
  due_on: string | null;
  resolved_at: string | null;
}

export interface IroCredentialEvent {
  id: string;
  physician_id: string;
  event_type: CredentialEventType;
  summary: string;
  actor: string;
  created_at: string;
}

export interface IroEvidence {
  id: string;
  physician_id: string;
  path: string;
  label: string;
  kind: EvidenceKind;
  content_type: string;
  created_at: string;
  created_by: string;
}

export interface IroPhysician {
  id: string;
  external_key: string;
  display_name: string;
  legal_name: string;
  email: string;
  phone: string;
  npi: string;
  status: IroPanelStatus;
  specialties: string[];
  jurisdictions: string[];
  availability: IroAvailability;
  assignment_status: IroAssignmentStatus;
  cv_storage_key: string | null;
  contract_ref: string | null;
  notes_hr: string | null;
  board_cert_waiver: string | null;
  application_received_at: string;
  recredential_due_at: string | null;
  approved_at: string | null;
  approved_expires_at: string | null;
  verification_completed_at: string | null;
  verification_completed_by: string | null;
  clinical_decision_at: string | null;
  clinical_decision_by: string | null;
  clinical_decision_note: string | null;
  conditional_terms: string | null;
  licenses: IroLicense[];
  board_certifications: IroBoardCert[];
  sanctions: IroSanction[];
  clinical_experience: IroExperience[];
  agreements: IroAgreement[];
  outstanding_items: IroOutstandingItem[];
  events: IroCredentialEvent[];
  evidence: IroEvidence[];
}

export interface IroReminder {
  id: string;
  physician_id: string;
  display_name: string;
  kind: 'license_expiry' | 'recredentialing' | 'outstanding_item' | 'agreement';
  due_on: string | null;
  message: string;
  status: 'open' | 'dismissed';
}

export interface IroCaseReview {
  case_ref: string;
  required_specialty: string;
  required_jurisdiction: string;
  assigned_physician_id: string | null;
  assignment_state: 'unassigned' | 'assigned' | 'completed';
  completed_at: string | null;
}

export interface IroAttestation {
  id: string;
  case_ref: string;
  physician_id: string;
  reviewer_user_id: string;
  reviewer_email: string;
  conflict_attested: boolean;
  conflict_free: boolean;
  conflict_note: string | null;
  qualification_attested: boolean;
  specialty_match: boolean;
  jurisdiction_match: boolean;
  attested_at: string;
}

export interface IroSettings {
  iro_line_contract: boolean;
  cutover_gate: 'closed' | 'open';
  workspace_tested: boolean;
  transferred_records_checked: boolean;
  access_permissions_confirmed: boolean;
}

export interface AssignmentIdentity {
  id: string;
  display_name: string;
  specialties: string[];
  jurisdictions: string[];
  availability: IroAvailability;
  assignment_status: IroAssignmentStatus;
}

export interface AssignmentCard extends AssignmentIdentity {
  case_checks_complete: boolean;
}

export interface CaseCheckRow {
  physician_id: string;
  case_checks_complete: boolean;
}

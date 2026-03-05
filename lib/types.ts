export type CaseStatus = 'intake' | 'processing' | 'brief_ready' | 'lpn_review' | 'rn_review' | 'md_review' | 'pend_missing_info' | 'determination_made' | 'delivered';
export type CasePriority = 'standard' | 'urgent' | 'expedited';
export type ServiceCategory =
  | 'imaging'
  | 'surgery'
  | 'specialty_referral'
  | 'dme'
  | 'infusion'
  | 'behavioral_health'
  | 'rehab_therapy'
  | 'home_health'
  | 'skilled_nursing'
  | 'transplant'
  | 'genetic_testing'
  | 'pain_management'
  | 'cardiology'
  | 'oncology'
  | 'other';
export type ReviewType = 'prior_auth' | 'medical_necessity' | 'concurrent' | 'retrospective' | 'peer_to_peer' | 'appeal' | 'second_level_review';
export type Determination = 'approve' | 'deny' | 'partial_approve' | 'modify' | 'pend' | 'peer_to_peer_requested';
export type StaffRole = 'lpn' | 'rn' | 'admin_staff';
export type IntakeChannel = 'portal' | 'efax' | 'email' | 'phone' | 'api' | 'batch_upload';
export type LpnDetermination = 'criteria_met' | 'criteria_not_met' | 'unclear' | 'escalate_to_rn';
export type RnDetermination = 'approve' | 'escalate_to_md';
export type AppealStatus = 'pending' | 'in_review' | 'determined' | 'withdrawn';
export type PeerToPeerStatus = 'requested' | 'scheduled' | 'completed' | 'declined' | 'no_response';
export type ReviewerStatus = 'active' | 'inactive' | 'pending' | 'credentialing';
export type ClientType = 'tpa' | 'health_plan' | 'self_funded_employer' | 'managed_care_org' | 'workers_comp' | 'auto_med';
export type FacilityType = 'inpatient' | 'outpatient' | 'asc' | 'office' | 'home';

/** @deprecated Use ServiceCategory instead. Kept for backward compatibility during migration. */
export type CaseVertical = 'dental' | 'vision' | 'medical';

export interface Case {
  id: string;
  created_at: string;
  updated_at: string;
  case_number: string;
  status: CaseStatus;
  priority: CasePriority;

  // Service classification (new medical-focused field)
  service_category: ServiceCategory | null;
  review_type: ReviewType | null;

  /** @deprecated Use service_category instead. Kept for backward compatibility. */
  vertical: CaseVertical | string;

  // Patient info
  patient_name: string | null;
  patient_dob: string | null;
  patient_member_id: string | null;
  patient_gender: string | null;

  // Requesting provider info
  requesting_provider: string | null;
  requesting_provider_npi: string | null;
  requesting_provider_specialty: string | null;

  // Servicing provider / facility info
  servicing_provider: string | null;
  servicing_provider_npi: string | null;
  facility_name: string | null;
  facility_type: FacilityType | null;

  // Clinical info
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string | null;
  clinical_question: string | null;

  // Review assignment
  assigned_reviewer_id: string | null;

  // Payer info
  payer_name: string | null;
  plan_type: string | null;

  // Turnaround / SLA
  turnaround_deadline: string | null;
  sla_hours: number | null;

  // AI Brief
  ai_brief: AIBrief | null;
  ai_brief_generated_at: string | null;

  // Fact-check / verification
  fact_check: FactCheckResult | null;
  fact_check_at: string | null;

  // Determination
  determination: Determination | null;
  determination_rationale: string | null;
  determination_at: string | null;
  determined_by: string | null;

  // Denial-specific fields
  denial_reason: string | null;
  denial_criteria_cited: string | null;
  alternative_recommended: string | null;

  // Documents
  submitted_documents: string[];

  // Client
  client_id: string | null;

  // Pod & nursing tier assignment
  assigned_pod_id: string | null;
  assigned_lpn_id: string | null;
  assigned_rn_id: string | null;

  // LPN review
  lpn_review_notes: string | null;
  lpn_review_at: string | null;
  lpn_determination: LpnDetermination | null;

  // RN review
  rn_review_notes: string | null;
  rn_review_at: string | null;
  rn_determination: RnDetermination | null;

  // SLA pause/resume
  sla_paused_at: string | null;
  sla_resumed_at: string | null;
  sla_pause_total_hours: number;

  // Intake tracking
  intake_channel: IntakeChannel | null;
  intake_confirmation_sent: boolean;
  authorization_number: string | null;

  // Peer-to-peer
  peer_to_peer_status: PeerToPeerStatus | null;
  peer_to_peer_scheduled_at: string | null;
  peer_to_peer_completed_at: string | null;
  peer_to_peer_notes: string | null;

  // Appeal link
  appeal_of_case_id: string | null;
  appeal_status: AppealStatus | null;

  // Joined fields
  reviewer?: Reviewer;
  client?: Client;
}

export interface Reviewer {
  id: string;
  created_at: string;
  name: string;
  credentials: string | null;
  specialty: string | null;
  subspecialty: string | null;
  board_certifications: string[];
  license_state: string[];
  license_states: string[];
  approved_service_categories: string[];
  max_cases_per_day: number | null;
  avg_turnaround_hours: number | null;
  dea_number: string | null;
  email: string | null;
  phone: string | null;
  status: ReviewerStatus;
  cases_completed: number;
}

export interface Client {
  id: string;
  created_at: string;
  name: string;
  type: ClientType | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  // Medical UR-specific client fields
  uses_interqual: boolean;
  uses_mcg: boolean;
  custom_guidelines_url: string | null;
  contracted_sla_hours: number | null;
  contracted_rate_per_case: number | null;
}

export interface AuditLogEntry {
  id: string;
  created_at: string;
  case_id: string | null;
  action: string;
  actor: string | null;
  details: Record<string, unknown> | null;
}

export interface AIBrief {
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

// ── Fact-Check / Verification Types ─────────────────────────────────────────

export type VerificationStatus = 'verified' | 'unverified' | 'flagged';

export interface ClaimVerification {
  claim: string;
  status: VerificationStatus;
  source: string | null;
  explanation: string;
}

export interface SectionVerification {
  section: string;
  claims: ClaimVerification[];
  flags: string[];
}

export interface ConsistencyCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export interface FactCheckResult {
  overall_score: number; // 0-100
  overall_status: 'pass' | 'warning' | 'fail';
  sections: SectionVerification[];
  summary: {
    verified: number;
    unverified: number;
    flagged: number;
  };
  consistency_checks: ConsistencyCheck[];
  checked_at: string;
}

// ── Staff & Pod Types ────────────────────────────────────────────────────────

export interface Staff {
  id: string;
  created_at: string;
  name: string;
  role: StaffRole;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  license_state: string | null;
  certifications: string[];
  max_cases_per_day: number | null;
  avg_turnaround_hours: number | null;
  status: 'active' | 'inactive' | 'on_leave';
  cases_completed: number;
  quality_score: number | null; // 0-100, from QA audits
}

export interface Pod {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  service_categories: ServiceCategory[];
  client_ids: string[]; // clients assigned to this pod
  lpn_ids: string[];
  rn_id: string | null; // supervising RN
  admin_staff_id: string | null;
  is_active: boolean;
  capacity_per_day: number | null;
}

export interface QualityAudit {
  id: string;
  created_at: string;
  case_id: string;
  auditor_id: string; // RN who performed the audit
  audited_staff_id: string; // LPN whose work was audited
  criteria_accuracy: number; // 0-100
  documentation_quality: number; // 0-100
  sla_compliance: boolean;
  determination_appropriate: boolean;
  notes: string | null;
  overall_score: number; // 0-100
  status: 'pending' | 'completed';
}

export interface MissingInfoRequest {
  id: string;
  created_at: string;
  case_id: string;
  requested_by: string; // staff ID
  requested_items: string[];
  sent_to: string | null; // provider contact
  sent_via: 'efax' | 'email' | 'portal' | 'phone';
  received_at: string | null;
  received_items: string[];
  status: 'pending' | 'received' | 'expired';
  deadline: string | null;
}

export interface DeterminationTemplate {
  id: string;
  created_at: string;
  client_id: string | null; // null = default template
  template_type: 'approval' | 'denial' | 'partial_approval' | 'pend' | 'modification';
  name: string;
  body_template: string; // Handlebars-style template
  appeal_instructions: string | null;
  is_active: boolean;
}

export interface Appeal {
  id: string;
  created_at: string;
  original_case_id: string;
  appeal_case_id: string; // new case created for the appeal
  reason: string;
  filed_by: string | null;
  filed_at: string;
  status: AppealStatus;
  original_denying_reviewer_id: string | null;
  assigned_reviewer_id: string | null; // must be different from original
  determination: Determination | null;
  determination_at: string | null;
  determination_rationale: string | null;
}

export interface PeerToPeerRecord {
  id: string;
  created_at: string;
  case_id: string;
  requesting_provider: string | null;
  reviewing_physician_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: 'upheld' | 'overturned' | 'modified' | null;
  notes: string | null;
  status: PeerToPeerStatus;
}

// ── Re-export Chat Types ────────────────────────────────────────────────────
export type { ChatMessage, ChatMode, StreamChunk, ChatRequest } from './chat/types';

export interface CaseFormData {
  service_category: ServiceCategory;
  priority: CasePriority;
  review_type: ReviewType;
  patient_name: string;
  patient_dob: string;
  patient_member_id: string;
  patient_gender: string;
  requesting_provider: string;
  requesting_provider_npi: string;
  requesting_provider_specialty: string;
  servicing_provider: string;
  servicing_provider_npi: string;
  facility_name: string;
  facility_type: FacilityType;
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string;
  clinical_question: string;
  payer_name: string;
  plan_type: string;
  client_id: string;
  intake_channel?: IntakeChannel;
  /** @deprecated Use service_category instead. Kept for backward compatibility. */
  vertical?: CaseVertical;
}

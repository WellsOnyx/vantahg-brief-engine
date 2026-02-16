export type CaseStatus = 'intake' | 'processing' | 'brief_ready' | 'in_review' | 'determination_made' | 'delivered';
export type CasePriority = 'standard' | 'urgent' | 'expedited';
export type CaseVertical = 'dental' | 'vision' | 'medical';
export type ReviewType = 'prior_auth' | 'medical_necessity' | 'concurrent' | 'retrospective' | 'peer_to_peer' | 'appeal';
export type Determination = 'approve' | 'deny' | 'partial_approve' | 'pend' | 'peer_to_peer_requested';
export type ReviewerStatus = 'active' | 'inactive' | 'pending';
export type ClientType = 'tpa' | 'health_plan' | 'self_funded_employer' | 'dental_plan' | 'vision_plan';

export interface Case {
  id: string;
  created_at: string;
  updated_at: string;
  case_number: string;
  status: CaseStatus;
  priority: CasePriority;
  vertical: CaseVertical;
  patient_name: string | null;
  patient_dob: string | null;
  patient_member_id: string | null;
  requesting_provider: string | null;
  requesting_provider_npi: string | null;
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string | null;
  clinical_question: string | null;
  assigned_reviewer_id: string | null;
  review_type: ReviewType | null;
  payer_name: string | null;
  plan_type: string | null;
  ai_brief: AIBrief | null;
  ai_brief_generated_at: string | null;
  determination: Determination | null;
  determination_rationale: string | null;
  determination_at: string | null;
  determined_by: string | null;
  submitted_documents: string[];
  client_id: string | null;
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
  license_state: string[];
  email: string | null;
  phone: string | null;
  status: ReviewerStatus;
  cases_completed: number;
  avg_turnaround_hours: number | null;
}

export interface Client {
  id: string;
  created_at: string;
  name: string;
  type: ClientType | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  procedure_analysis: {
    codes: string[];
    clinical_rationale: string;
    complexity_level: 'routine' | 'moderate' | 'complex';
  };
  criteria_match: {
    applicable_guideline: string;
    criteria_met: string[];
    criteria_not_met: string[];
    criteria_unable_to_assess: string[];
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
  };
  reviewer_action: {
    decision_required: string;
    time_sensitivity: string;
    peer_to_peer_suggested: boolean;
    additional_info_needed: string[];
  };
}

export interface CaseFormData {
  vertical: CaseVertical;
  priority: CasePriority;
  review_type: ReviewType;
  patient_name: string;
  patient_dob: string;
  patient_member_id: string;
  requesting_provider: string;
  requesting_provider_npi: string;
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string;
  clinical_question: string;
  payer_name: string;
  plan_type: string;
  client_id: string;
}

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Claude tool definitions for the VantaHG chat interface.
 * These let Claude extract structured data and look up medical codes
 * during conversation.
 */

export const chatTools: Anthropic.Tool[] = [
  {
    name: 'extract_case_data',
    description: `Extract structured case data fields from the user's message. Call this whenever you identify patient info, procedure codes, provider info, or other case fields in the conversation. Fields will be accumulated into the case record.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        patient_name: { type: 'string', description: 'Patient full name' },
        patient_dob: { type: 'string', description: 'Patient date of birth (YYYY-MM-DD)' },
        patient_member_id: { type: 'string', description: 'Insurance member ID' },
        patient_gender: { type: 'string', enum: ['male', 'female', 'other'], description: 'Patient gender' },
        service_category: {
          type: 'string',
          enum: ['imaging', 'surgery', 'specialty_referral', 'dme', 'infusion', 'behavioral_health', 'rehab_therapy', 'home_health', 'skilled_nursing', 'transplant', 'genetic_testing', 'pain_management', 'cardiology', 'oncology', 'other'],
          description: 'Medical service category',
        },
        review_type: {
          type: 'string',
          enum: ['prior_auth', 'medical_necessity', 'concurrent', 'retrospective', 'peer_to_peer', 'appeal', 'second_level_review'],
          description: 'Type of utilization review',
        },
        priority: {
          type: 'string',
          enum: ['standard', 'urgent', 'expedited'],
          description: 'Case priority level',
        },
        requesting_provider: { type: 'string', description: 'Requesting provider name' },
        requesting_provider_npi: { type: 'string', description: 'Provider NPI number (10 digits)' },
        requesting_provider_specialty: { type: 'string', description: 'Provider medical specialty' },
        servicing_provider: { type: 'string', description: 'Servicing provider name (if different)' },
        facility_name: { type: 'string', description: 'Facility name' },
        facility_type: {
          type: 'string',
          enum: ['inpatient', 'outpatient', 'asc', 'office', 'home'],
          description: 'Facility type / care setting',
        },
        procedure_codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'CPT or HCPCS procedure codes',
        },
        diagnosis_codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'ICD-10 diagnosis codes',
        },
        procedure_description: { type: 'string', description: 'Description of the procedure/service requested' },
        clinical_question: { type: 'string', description: 'The clinical question to be answered by the review' },
        payer_name: { type: 'string', description: 'Insurance payer name' },
        plan_type: { type: 'string', description: 'Plan type (HMO, PPO, etc.)' },
      },
      required: [],
    },
  },
  {
    name: 'lookup_cpt_code',
    description: 'Search for a CPT or HCPCS procedure code by code number or description. Returns matching codes from the VantaHG medical criteria database.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'CPT/HCPCS code number or description to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_criteria',
    description: 'Get detailed medical necessity criteria for a specific CPT/HCPCS code. Returns typical criteria, common denial reasons, and guideline references.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The CPT or HCPCS code to look up criteria for',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'check_guideline',
    description: 'Verify whether a clinical guideline reference is recognized (e.g., InterQual, MCG, NCCN). Returns the guideline details if found.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guideline: {
          type: 'string',
          description: 'The guideline name or reference to verify',
        },
      },
      required: ['guideline'],
    },
  },
];

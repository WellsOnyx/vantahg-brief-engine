import { describe, it, expect } from 'vitest';
import { factCheckBrief } from '@/lib/fact-checker';
import type { AIBrief, Case } from '@/lib/types';

function makeBrief(overrides: Partial<AIBrief> = {}): AIBrief {
  return {
    clinical_question: 'Is MRI lumbar spine medically necessary?',
    patient_summary: 'Patient with chronic low back pain',
    diagnosis_analysis: {
      primary_diagnosis: 'M54.5 - Low back pain',
      secondary_diagnoses: [],
      diagnosis_procedure_alignment: 'Good alignment',
    },
    procedure_analysis: {
      codes: ['72148'],
      clinical_rationale: 'Persistent symptoms after conservative treatment',
      complexity_level: 'moderate',
      setting_appropriateness: 'Outpatient appropriate',
    },
    criteria_match: {
      guideline_source: 'ACR Appropriateness Criteria',
      applicable_guideline: 'ACR Appropriateness Criteria - Low Back Pain',
      criteria_met: ['Low back pain >6 weeks despite conservative treatment'],
      criteria_not_met: [],
      criteria_unable_to_assess: [],
      conservative_alternatives: [],
    },
    documentation_review: {
      documents_provided: 'Clinical notes, imaging order',
      key_findings: ['6+ weeks of symptoms'],
      missing_documentation: [],
    },
    ai_recommendation: {
      recommendation: 'approve',
      confidence: 'high',
      rationale: 'Criteria met for imaging',
      key_considerations: [],
      if_modify_suggestion: null,
    },
    reviewer_action: {
      decision_required: 'Approve or deny',
      time_sensitivity: 'Standard',
      peer_to_peer_suggested: false,
      additional_info_needed: [],
      state_specific_requirements: [],
    },
    ...overrides,
  };
}

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'test-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    case_number: 'VHG-IMAGING-0001',
    status: 'brief_ready',
    priority: 'standard',
    service_category: 'imaging',
    review_type: 'prior_auth',
    vertical: 'medical',
    patient_name: 'Test Patient',
    patient_dob: '1990-01-01',
    patient_member_id: 'MEM123456',
    patient_gender: 'male',
    requesting_provider: 'Dr. Smith',
    requesting_provider_npi: '1234567890',
    requesting_provider_specialty: 'Orthopedics',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: null,
    facility_type: null,
    procedure_codes: ['72148'],
    diagnosis_codes: ['M54.5'],
    procedure_description: 'MRI Lumbar Spine',
    clinical_question: 'Medical necessity for lumbar MRI',
    assigned_reviewer_id: null,
    payer_name: null,
    plan_type: null,
    turnaround_deadline: null,
    sla_hours: null,
    ai_brief: null,
    ai_brief_generated_at: null,
    fact_check: null,
    fact_check_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    submitted_documents: [],
    client_id: null,
    ...overrides,
  } as Case;
}

describe('factCheckBrief', () => {
  it('returns a result with overall_score between 0 and 100', () => {
    const result = factCheckBrief(makeBrief(), makeCase());
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
  });

  it('returns pass for well-formed brief with known codes and guidelines', () => {
    const result = factCheckBrief(makeBrief(), makeCase());
    expect(result.overall_status).toBe('pass');
    expect(result.summary.flagged).toBe(0);
  });

  it('flags unrecognized guideline sources', () => {
    const brief = makeBrief({
      criteria_match: {
        ...makeBrief().criteria_match,
        guideline_source: 'Completely Fabricated Guidelines Inc.',
      },
    });
    const result = factCheckBrief(brief, makeCase());
    expect(result.summary.flagged).toBeGreaterThan(0);
  });

  it('detects recommendation-criteria misalignment', () => {
    const brief = makeBrief({
      ai_recommendation: {
        ...makeBrief().ai_recommendation,
        recommendation: 'deny',
      },
      criteria_match: {
        ...makeBrief().criteria_match,
        criteria_met: ['Criterion A', 'Criterion B', 'Criterion C'],
        criteria_not_met: [],
      },
    });
    const result = factCheckBrief(brief, makeCase());
    const misalignment = result.consistency_checks.find(
      (c) => c.check === 'Recommendation-criteria alignment'
    );
    expect(misalignment?.passed).toBe(false);
  });

  it('detects overconfidence with many unable-to-assess items', () => {
    const brief = makeBrief({
      criteria_match: {
        ...makeBrief().criteria_match,
        criteria_unable_to_assess: ['Item 1', 'Item 2', 'Item 3'],
      },
    });
    const result = factCheckBrief(brief, makeCase());
    const confidenceCheck = result.consistency_checks.find(
      (c) => c.check === 'Confidence-uncertainty alignment'
    );
    expect(confidenceCheck?.passed).toBe(false);
  });

  it('validates procedure code formats', () => {
    const brief = makeBrief({
      procedure_analysis: {
        ...makeBrief().procedure_analysis,
        codes: ['72148', 'INVALID'],
      },
    });
    const result = factCheckBrief(brief, makeCase());
    const codeSection = result.sections.find(
      (s) => s.section === 'Procedure & Diagnosis Codes'
    );
    expect(codeSection?.flags.length).toBeGreaterThan(0);
  });
});

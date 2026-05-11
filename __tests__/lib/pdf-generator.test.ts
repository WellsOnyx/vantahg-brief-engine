import { describe, it, expect } from 'vitest';
import { generateBriefPdf } from '@/lib/pdf-generator';
import { demoCases } from '@/lib/demo-data';
import type { AIBrief, Case } from '@/lib/types';

const PDF_MAGIC = '%PDF-';
// A real brief PDF should weigh at least several KB once the fonts and
// structure are in place. 5KB is comfortably above an empty-document
// baseline (~1KB) and well below anything a normal brief would produce.
const MIN_REASONABLE_BYTES = 5_000;

function makeMinimalBrief(): AIBrief {
  return {
    clinical_question: 'Test',
    patient_summary: 'Test',
    diagnosis_analysis: {
      primary_diagnosis: 'M54.5',
      secondary_diagnoses: [],
      diagnosis_procedure_alignment: 'Aligned',
    },
    procedure_analysis: {
      codes: ['72148'],
      clinical_rationale: 'Test',
      complexity_level: 'routine',
      setting_appropriateness: 'Outpatient',
    },
    criteria_match: {
      guideline_source: 'ACR',
      applicable_guideline: 'ACR Appropriateness Criteria',
      criteria_met: [],
      criteria_not_met: [],
      criteria_unable_to_assess: [],
      conservative_alternatives: [],
    },
    documentation_review: {
      documents_provided: 'PCP note',
      key_findings: [],
      missing_documentation: [],
    },
    ai_recommendation: {
      recommendation: 'approve',
      confidence: 'high',
      rationale: 'Test',
      key_considerations: [],
      if_modify_suggestion: null,
    },
    reviewer_action: {
      decision_required: 'Confirm',
      time_sensitivity: 'Standard',
      peer_to_peer_suggested: false,
      additional_info_needed: [],
      state_specific_requirements: [],
    },
  };
}

describe('generateBriefPdf', () => {
  it('produces a valid PDF for a fully-populated demo case', async () => {
    const caseWithBrief = demoCases.find((c) => c.ai_brief !== null);
    expect(caseWithBrief, 'demo-data must contain at least one case with ai_brief').toBeDefined();

    const buffer = await generateBriefPdf(caseWithBrief!);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.slice(0, 5).toString('ascii')).toBe(PDF_MAGIC);
    // Trailer should be present; not asserting an exact byte sequence to keep
    // this resilient across jsPDF versions, but a well-formed PDF will be
    // meaningfully large.
    expect(buffer.length).toBeGreaterThan(MIN_REASONABLE_BYTES);
  });

  it('renders without crashing when every list field is empty', async () => {
    const minimalCase = {
      ...demoCases[0],
      ai_brief: makeMinimalBrief(),
    } as Case;

    const buffer = await generateBriefPdf(minimalCase);

    expect(buffer.slice(0, 5).toString('ascii')).toBe(PDF_MAGIC);
    expect(buffer.length).toBeGreaterThan(MIN_REASONABLE_BYTES);
  });

  it('throws a clear error when ai_brief is null', async () => {
    const caseWithoutBrief = { ...demoCases[0], ai_brief: null } as Case;

    await expect(generateBriefPdf(caseWithoutBrief)).rejects.toThrow(/ai_brief is null/);
  });
});

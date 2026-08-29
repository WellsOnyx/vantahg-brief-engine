import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildReviewSample,
  sampleRef,
  captureReviewSample,
} from '@/lib/dataset/review-dataset';

/**
 * Coverage:
 *   - buildReviewSample pairs de-identified INPUTS with the human LABEL
 *   - free-text mode scrubs narrative; structured mode omits it entirely
 *   - polymorphic determination (UM text enum vs IDR JSONB blob) both handled
 *   - sampleRef is deterministic + never the raw case id
 *   - captureReviewSample no-ops safely in demo mode
 */

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

const UM_CASE = {
  id: 'case-1',
  case_type: 'um',
  service_category: 'orthopedics',
  review_type: 'prior_auth',
  priority: 'standard',
  patient_name: 'Maria Gonzalez',
  patient_dob: '1980-04-12',
  patient_member_id: 'MBR-99887766',
  patient_gender: 'female',
  procedure_codes: ['27447'],
  diagnosis_codes: ['M17.11'],
  procedure_description: 'TKA for Maria Gonzalez',
  clinical_question: 'Is TKA medically necessary?',
  ai_brief: {
    criteria_match: {
      guideline_source: 'InterQual',
      applicable_guideline: 'Knee Arthroplasty',
      criteria_met: ['Failed conservative therapy'],
      criteria_not_met: [],
      criteria_unable_to_assess: [],
    },
    procedure_analysis: { complexity_level: 'moderate' },
    ai_recommendation: { recommendation: 'approve', confidence: 'high', rationale: 'Meets criteria' },
  },
  fact_check: { overall_score: 88 },
  determination: 'approve',
  determination_rationale: 'Approved for Maria Gonzalez, criteria met.',
  determination_at: '2024-06-15T10:00:00Z',
  rn_determination: 'approve',
  physician_ai_agreement: 'agree',
  physician_ai_feedback_notes: 'Concur with AI.',
  lpn_review_notes: 'LPN note for MBR-99887766',
};

const AUDIT = [
  { action: 'determination_made', details: { rationale: 'Final: approve for Maria Gonzalez' } },
  { action: 'status_changed', details: { new_status: 'delivered' } },
];

describe('buildReviewSample — free-text mode', () => {
  const built = buildReviewSample(UM_CASE, AUDIT, { includeFreetext: true });

  it('classifies the sample from non-PHI fields', () => {
    expect(built.case_type).toBe('um');
    expect(built.service_category).toBe('orthopedics');
    expect(built.source_determination).toBe('approve');
    expect(built.contains_freetext).toBe(true);
  });

  it('captures de-identified inputs incl. bucketed age + kept gender + codes', () => {
    const inputs = built.payload.inputs as any;
    expect(inputs.patient.gender).toBe('female');
    expect(typeof inputs.patient.age).toBe('number');
    expect(inputs.procedure_codes).toEqual(['27447']);
    expect(inputs.clinical_question).toBe('Is TKA medically necessary?');
    // Procedure description had the patient name — must be scrubbed.
    expect(inputs.procedure_description).not.toMatch(/Gonzalez/);
    expect(inputs.procedure_description).toContain('[PATIENT]');
  });

  it('captures the human label with rationale scrubbed of PHI', () => {
    const label = built.payload.label as any;
    expect(label.determination).toBe('approve');
    expect(label.rn_determination).toBe('approve');
    expect(label.physician_ai_agreement).toBe('agree');
    expect(label.determination_rationale).not.toMatch(/Gonzalez/);
    expect(label.determined_year).toBe(2024);
    expect(label.tier_notes.lpn).not.toMatch(/99887766/);
  });

  it('pulls a scrubbed reasoning trail from audit events', () => {
    const label = built.payload.label as any;
    expect(Array.isArray(label.reasoning_trail)).toBe(true);
    expect(label.reasoning_trail[0].rationale).not.toMatch(/Gonzalez/);
    expect(label.reasoning_trail[0].action).toBe('determination_made');
  });

  it('stamps de-identification provenance in meta', () => {
    const meta = (built.payload.meta as any);
    expect(meta.deident_method).toBe('safe_harbor_v1');
    expect(meta.contains_freetext).toBe(true);
  });
});

describe('buildReviewSample — structured (coded-only) mode', () => {
  const built = buildReviewSample(UM_CASE, AUDIT, { includeFreetext: false });

  it('omits narrative fields entirely', () => {
    const inputs = built.payload.inputs as any;
    const label = built.payload.label as any;
    expect(inputs.clinical_question).toBeUndefined();
    expect(inputs.procedure_description).toBeUndefined();
    expect(label.determination_rationale).toBeUndefined();
    expect(label.reasoning_trail).toBeUndefined();
    expect(built.contains_freetext).toBe(false);
  });

  it('keeps a coded brief summary (counts + recommendation, no free text)', () => {
    const brief = (built.payload.inputs as any).ai_brief;
    expect(brief.guideline_source).toBe('InterQual');
    expect(brief.criteria_met_count).toBe(1);
    expect(brief.ai_recommendation).toBe('approve');
    expect(brief.ai_confidence).toBe('high');
    // No raw criteria text arrays leak through.
    expect(brief.criteria_met).toBeUndefined();
  });

  it('still keeps the structured label + codes', () => {
    const inputs = built.payload.inputs as any;
    expect(inputs.procedure_codes).toEqual(['27447']);
    expect((built.payload.label as any).determination).toBe('approve');
  });
});

describe('buildReviewSample — polymorphic IDR determination', () => {
  it('unpacks a JSONB determination blob (payer IDR)', () => {
    const idrCase = {
      id: 'case-2',
      case_type: 'payer_idr',
      determination: {
        determination: 'deny',
        rationale: 'QPA supported by Dr. Alan Grant analysis',
        idr_factors_considered: ['qpa', 'complexity'],
      },
      determination_at: '2024-07-01T00:00:00Z',
      requesting_provider: 'Dr. Alan Grant',
    };
    const built = buildReviewSample(idrCase, [], { includeFreetext: true });
    expect(built.source_determination).toBe('deny');
    const label = built.payload.label as any;
    expect(label.determination).toBe('deny');
    expect(label.determination_rationale).not.toMatch(/Grant/);
    expect(label.idr_factors).toBeTruthy();
  });
});

describe('sampleRef', () => {
  it('is deterministic and never the raw case id', () => {
    const a = sampleRef('case-1');
    const b = sampleRef('case-1');
    expect(a).toBe(b);
    expect(a).not.toContain('case-1');
    expect(a.startsWith('rs_')).toBe(true);
  });

  it('differs across case ids', () => {
    expect(sampleRef('case-1')).not.toBe(sampleRef('case-2'));
  });
});

describe('captureReviewSample — demo mode', () => {
  beforeEach(() => clearSupabaseEnv());

  it('no-ops with a sample_ref and never touches a DB', async () => {
    const res = await captureReviewSample('case-1', { actor: 'test@vantaum.com' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.skipped).toBe('demo');
      expect(res.sample_ref).toBe(sampleRef('case-1'));
    }
  });
});

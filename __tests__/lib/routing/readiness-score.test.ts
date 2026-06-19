import { describe, it, expect } from 'vitest';
import {
  scoreReadiness,
  AUTO_FACT_CHECK_THRESHOLD,
  type ReadinessInput,
} from '@/lib/routing/readiness-score';
import type { AIBrief, FactCheckResult } from '@/lib/types';

/**
 * Tests for the two-tier routing brain (docs/throughput-architecture-11k.md).
 * The whole gamified-approval model rests on this: a clean case must land
 * in 'auto', and ANY uncertainty — above all a denial — must land in
 * 'review'. These tests pin the guardrails so the auto lane can never
 * silently swallow a case that deserves human reasoning.
 */

function factCheck(over: Partial<FactCheckResult> = {}): FactCheckResult {
  return {
    overall_score: 95,
    overall_status: 'pass',
    sections: [],
    summary: { verified: 8, unverified: 0, flagged: 0 },
    consistency_checks: [],
    checked_at: '2026-06-15T12:00:00.000Z',
    human_review_recommended: false,
    review_reasons: [],
    ...over,
  };
}

function brief(
  recommendation: AIBrief['ai_recommendation']['recommendation'] = 'approve',
  confidence: AIBrief['ai_recommendation']['confidence'] = 'high',
  criteriaOver: Partial<AIBrief['criteria_match']> = {},
): AIBrief {
  return {
    patient_summary: '',
    diagnosis_analysis: { primary_diagnosis: '', secondary_diagnoses: [], diagnosis_procedure_alignment: '' },
    procedure_analysis: { codes: [], clinical_rationale: '', complexity_level: 'routine', setting_appropriateness: '' },
    criteria_match: {
      guideline_source: 'VantaUM Criteria VC-72148-v1',
      applicable_guideline: 'VC-72148-v1',
      criteria_met: ['a', 'b', 'c'],
      criteria_not_met: [],
      criteria_unable_to_assess: [],
      conservative_alternatives: [],
      ...criteriaOver,
    },
    documentation_review: { documents_provided: '', key_findings: [], missing_documentation: [] },
    ai_recommendation: { recommendation, confidence, rationale: '', key_considerations: [], if_modify_suggestion: null },
    reviewer_action: { decision_required: '', time_sensitivity: '', peer_to_peer_suggested: false, additional_info_needed: [], state_specific_requirements: [] },
  } as AIBrief;
}

const CLEAN: ReadinessInput = {
  procedure_codes: ['72148'],
  ai_brief: brief(),
  fact_check: factCheck(),
};

describe('scoreReadiness — auto lane (the clean case)', () => {
  it('routes a fully-clean, high-confidence, criteria-met approve to auto', () => {
    const d = scoreReadiness(CLEAN);
    expect(d.lane).toBe('auto');
    expect(d.reasons).toEqual([]);
    expect(d.score).toBeGreaterThanOrEqual(95);
    expect(d.signals.criteria_verdict).toBe('met');
  });
});

describe('scoreReadiness — review lane guardrails', () => {
  it('DENIAL never auto-approves, even when every other signal is perfect', () => {
    const d = scoreReadiness({ ...CLEAN, ai_brief: brief('deny', 'high') });
    expect(d.lane).toBe('review');
    expect(d.reasons.some((r) => /denial|adverse/i.test(r))).toBe(true);
  });

  it('pend and peer_to_peer also require human review', () => {
    expect(scoreReadiness({ ...CLEAN, ai_brief: brief('pend', 'high') }).lane).toBe('review');
    expect(scoreReadiness({ ...CLEAN, ai_brief: brief('peer_to_peer_recommended', 'high') }).lane).toBe('review');
  });

  it('low/medium AI confidence forces review', () => {
    expect(scoreReadiness({ ...CLEAN, ai_brief: brief('approve', 'low') }).lane).toBe('review');
    expect(scoreReadiness({ ...CLEAN, ai_brief: brief('approve', 'medium') }).lane).toBe('review');
  });

  it('fact-check status other than pass forces review', () => {
    expect(scoreReadiness({ ...CLEAN, fact_check: factCheck({ overall_status: 'warning' }) }).lane).toBe('review');
    expect(scoreReadiness({ ...CLEAN, fact_check: factCheck({ overall_status: 'fail' }) }).lane).toBe('review');
  });

  it('fact-check score below the auto threshold forces review', () => {
    const d = scoreReadiness({ ...CLEAN, fact_check: factCheck({ overall_score: AUTO_FACT_CHECK_THRESHOLD - 1 }) });
    expect(d.lane).toBe('review');
    expect(d.reasons.some((r) => /below auto threshold/i.test(r))).toBe(true);
  });

  it('human_review_recommended forces review and surfaces the fact-checker reasons', () => {
    const d = scoreReadiness({
      ...CLEAN,
      fact_check: factCheck({ human_review_recommended: true, review_reasons: ['Unverified dosage claim'] }),
    });
    expect(d.lane).toBe('review');
    expect(d.reasons).toContain('Unverified dosage claim');
  });

  it('criteria not fully met forces review', () => {
    const d = scoreReadiness({
      ...CLEAN,
      ai_brief: brief('approve', 'high', { criteria_not_met: ['missing conservative therapy'] }),
    });
    expect(d.lane).toBe('review');
    expect(d.signals.criteria_verdict).toBe('not_met');
  });

  it('a case with no brief yet is review, not auto', () => {
    const d = scoreReadiness({ procedure_codes: ['72148'], ai_brief: null, fact_check: null });
    expect(d.lane).toBe('review');
    expect(d.score).toBe(0);
    expect(d.reasons[0]).toMatch(/not ready/i);
  });
});

describe('scoreReadiness — multiple failures accumulate reasons', () => {
  it('lists every failed gate so the Lane-2 UI can explain itself', () => {
    const d = scoreReadiness({
      procedure_codes: ['72148'],
      ai_brief: brief('deny', 'low', { criteria_not_met: ['x'] }),
      fact_check: factCheck({ overall_status: 'fail', overall_score: 40, human_review_recommended: true, review_reasons: ['flagged claim'] }),
    });
    expect(d.lane).toBe('review');
    // status + score + human flag + criteria + confidence + denial = several reasons
    expect(d.reasons.length).toBeGreaterThanOrEqual(5);
    expect(d.score).toBeLessThan(50);
  });
});

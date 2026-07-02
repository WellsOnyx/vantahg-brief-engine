import { describe, it, expect } from 'vitest';

import {
  computeLaborMetric,
  computeLaborMetricForCase,
  stepsForStream,
  isConfidenceResolved,
  confidenceResolutionRate,
  WEIGHTS_BASIS,
} from '@/lib/labor-metric';
// The synthetic harness's entry point — MUST compute identically.
import * as synthetic from '@/lib/synthetic/labor-metric';

describe('labor-reduction metric — canonical formula', () => {
  it('UM worked example: 44 engine / 12 human / 56 total → 79% engine, 21% human', () => {
    const m = computeLaborMetricForCase({ case_type: 'um' });
    expect(m.engine_lu).toBe(44);
    expect(m.human_lu).toBe(12);
    expect(m.total_lu).toBe(56);
    expect(m.labor_reduction_pct).toBe(79); // round(44/56*100) = round(78.57)
    expect(m.human_judgment_pct).toBe(21);
    expect(m.labor_reduction_pct + m.human_judgment_pct).toBe(100);
    expect(m.weights_basis).toBe(WEIGHTS_BASIS); // 'estimated_pending_calibration'
  });

  it('hybrid steps are SPLIT: engine gets the drafting share, human the judgment share', () => {
    const steps = stepsForStream('um');
    const concierge = steps.find((s) => s.id === 'concierge_validation')!;
    const clinical = steps.find((s) => s.id === 'clinical_review')!;
    expect(concierge.weight).toBe(3);
    expect(concierge.engineShare).toBe(1); // engine surfaces flags; human validates (2)
    expect(clinical.weight).toBe(10);
    expect(clinical.engineShare).toBe(4); // engine assembles criteria/evidence; human judges (6)
  });

  it('the 95% rule: determination is pure human (engineShare 0) → metric can never be 100%', () => {
    const det = stepsForStream('um').find((s) => s.id === 'determination')!;
    expect(det.engineShare).toBe(0);
    expect(computeLaborMetricForCase({ case_type: 'um' }).labor_reduction_pct).toBeLessThan(100);
  });

  it('per-step actual override shifts labor to human (e.g. a human re-did extraction)', () => {
    const base = computeLaborMetricForCase({ case_type: 'um' });
    const overridden = computeLaborMetricForCase({ case_type: 'um' }, { data_extraction: 0 });
    // extraction weight 8 moves from engine to human
    expect(overridden.engine_lu).toBe(base.engine_lu - 8);
    expect(overridden.human_lu).toBe(base.human_lu + 8);
    expect(overridden.total_lu).toBe(base.total_lu);
    expect(overridden.labor_reduction_pct).toBeLessThan(base.labor_reduction_pct);
  });

  it('streams route correctly and always sum to 100', () => {
    for (const ct of ['um', 'payer_idr', 'iro', 'medical_review'] as const) {
      const m = computeLaborMetricForCase({ case_type: ct });
      expect(m.total_lu).toBeGreaterThan(0);
      expect(m.labor_reduction_pct + m.human_judgment_pct).toBe(100);
    }
    // IDR has no internal clinical tier; medical_review mirrors UM weights.
    expect(stepsForStream('payer_idr').some((s) => s.id === 'clinical_review')).toBe(false);
    expect(computeLaborMetricForCase({ case_type: 'medical_review' }).labor_reduction_pct).toBe(
      computeLaborMetricForCase({ case_type: 'um' }).labor_reduction_pct,
    );
  });
});

describe('confidence-resolution metric', () => {
  const complete = { directional_confidence: 92, brief_complete: true, recommendation: 'approve' as const };

  it('resolved when ≥85% directional confidence + complete brief + a directional recommendation', () => {
    expect(isConfidenceResolved(complete)).toBe(true);
  });
  it('NOT resolved below the 85% threshold', () => {
    expect(isConfidenceResolved({ ...complete, directional_confidence: 84 })).toBe(false);
  });
  it('NOT resolved without a complete evidentiary brief', () => {
    expect(isConfidenceResolved({ ...complete, brief_complete: false })).toBe(false);
  });
  it('NOT resolved without a directional recommendation', () => {
    expect(isConfidenceResolved({ ...complete, recommendation: null })).toBe(false);
  });
  it('rate = resolved ÷ inbound (2 of 4 = 50%)', () => {
    const rate = confidenceResolutionRate([
      complete,
      { directional_confidence: 88, brief_complete: true, recommendation: 'deny' },
      { directional_confidence: 70, brief_complete: true, recommendation: 'modify' },
      { directional_confidence: 95, brief_complete: false, recommendation: 'approve' },
    ]);
    expect(rate).toBe(50);
  });
});

describe('contract stability — synthetic harness computes IDENTICAL percentages', () => {
  it('lib/synthetic/labor-metric re-exports the canonical formula (identical results)', () => {
    for (const ct of ['um', 'payer_idr', 'iro', 'medical_review'] as const) {
      const canonical = computeLaborMetricForCase({ case_type: ct });
      const viaHarness = synthetic.computeLaborMetricForCase({ case_type: ct });
      expect(viaHarness).toEqual(canonical);
    }
    expect(synthetic.confidenceResolutionRate([{ directional_confidence: 90, brief_complete: true, recommendation: 'approve' }])).toBe(
      confidenceResolutionRate([{ directional_confidence: 90, brief_complete: true, recommendation: 'approve' }]),
    );
  });
});

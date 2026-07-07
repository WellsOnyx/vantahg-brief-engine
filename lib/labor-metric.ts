/**
 * Labor-reduction metric — CANONICAL computation (see docs/LABOR_METRIC.md).
 *
 * This is the single source of truth. Both consumers compute against it:
 *  - the synthetic harness via lib/synthetic/labor-metric.ts (re-exports this)
 *  - the per-case cockpit field (cases.labor_metric)
 * so the percentages are guaranteed identical. Keep this contract stable.
 *
 * Two metrics:
 *  1. labor-reduction %  = engine labor units ÷ total labor units
 *  2. confidence-resolution = the case reached ≥85% directional confidence
 *     (approve/deny/modify) with a complete evidentiary brief.
 *
 * Weights are ESTIMATES pending calibration (WEIGHTS_BASIS below). Never present
 * the output as measured until calibrated from real time-motion data.
 */

export const WEIGHTS_BASIS = 'estimated_pending_calibration' as const;

/** Directional-confidence threshold for the confidence-resolution metric. */
export const CONFIDENCE_THRESHOLD = 85;

export type LaborStream = 'um' | 'medical_review' | 'payer_idr' | 'iro' | 'ire';

/**
 * One pipeline step's labor. `weight` = estimated manual-minutes if done by hand.
 * `engineShare` = the portion of that weight the engine carries.
 *   - pure engine  → engineShare === weight
 *   - pure human   → engineShare === 0     (e.g. the determination — the 95% rule)
 *   - hybrid split → 0 < engineShare < weight  (engine drafts, human judges on top)
 * humanShare is derived as weight − engineShare.
 */
export interface LaborStep {
  id: string;
  label: string;
  weight: number;
  engineShare: number;
}

export interface LaborMetricResult {
  stream: LaborStream;
  engine_lu: number;
  human_lu: number;
  total_lu: number;
  /** engine ÷ total, rounded to a whole percent. */
  labor_reduction_pct: number;
  /** 100 − labor_reduction_pct (complementary, always sums to 100). */
  human_judgment_pct: number;
  /** Unrounded ratio for roll-ups / audits. */
  labor_reduction_ratio: number;
  weights_basis: typeof WEIGHTS_BASIS;
}

// ── Canonical per-stream step tables (ESTIMATED weights, pending calibration) ──
// Hybrid steps (concierge_validation, clinical/panel_review, attorney work) are
// SPLIT: the engine gets the drafting share, the human gets the judgment share.

const UM_STEPS: LaborStep[] = [
  { id: 'intake_ocr', label: 'Intake / OCR', weight: 6, engineShare: 6 },
  { id: 'data_extraction', label: 'Data extraction', weight: 8, engineShare: 8 },
  { id: 'dedup', label: 'Dedup', weight: 2, engineShare: 2 },
  { id: 'brief_generation', label: 'Brief generation (criteria match)', weight: 12, engineShare: 12 },
  { id: 'fact_check', label: 'Fact-check', weight: 5, engineShare: 5 },
  { id: 'routing_sla', label: 'Routing / SLA', weight: 2, engineShare: 2 },
  // hybrid: engine pre-surfaces fact-check flags (1), human validates (2)
  { id: 'concierge_validation', label: 'Concierge validation', weight: 3, engineShare: 1 },
  // hybrid: engine assembles criteria + evidence (4), human renders clinical judgment (6)
  { id: 'clinical_review', label: 'Clinical criteria review (LPN/RN)', weight: 10, engineShare: 4 },
  // pure human — the 95% rule: the engine never decides
  { id: 'determination', label: 'Determination (clinical judgment)', weight: 4, engineShare: 0 },
  { id: 'letter_render', label: 'Letter render', weight: 3, engineShare: 3 },
  { id: 'audit', label: 'Audit', weight: 1, engineShare: 1 },
];

// Medical Review — like UM, but a panel reviewer (external/contracted) renders the
// review in place of the internal LPN/RN tier.
const MEDICAL_REVIEW_STEPS: LaborStep[] = UM_STEPS.map((s) =>
  s.id === 'clinical_review'
    ? { id: 'panel_review', label: 'Panel reviewer review', weight: 10, engineShare: 4 }
    : s,
);

// Payer IDR — no clinical tier; NSA weight-of-evidence brief + attorney determination.
const IDR_STEPS: LaborStep[] = [
  { id: 'intake_ocr', label: 'Intake / OCR', weight: 6, engineShare: 6 },
  { id: 'data_extraction', label: 'Data extraction', weight: 8, engineShare: 8 },
  { id: 'dedup', label: 'Dedup', weight: 2, engineShare: 2 },
  { id: 'brief_generation', label: 'NSA factor brief', weight: 14, engineShare: 14 },
  { id: 'fact_check', label: 'Fact-check', weight: 5, engineShare: 5 },
  { id: 'routing_sla', label: 'Routing / SLA', weight: 2, engineShare: 2 },
  // hybrid: engine assembles the NSA factor weighing (4), attorney judges (8)
  { id: 'attorney_determination', label: 'Attorney weight-of-evidence determination', weight: 12, engineShare: 4 },
  { id: 'letter_render', label: 'Letter render', weight: 3, engineShare: 3 },
  { id: 'audit', label: 'Audit', weight: 1, engineShare: 1 },
];

// IRO — like UM plus independence enforcement; an external independent
// reviewer renders the determination.
const IRO_STEPS: LaborStep[] = [
  ...UM_STEPS.filter((s) => s.id !== 'clinical_review' && s.id !== 'determination'),
  { id: 'independence_enforcement', label: 'Reviewer independence enforcement', weight: 1, engineShare: 1 },
  { id: 'independent_review', label: 'Independent reviewer review', weight: 10, engineShare: 4 },
  { id: 'determination', label: 'Independent determination', weight: 4, engineShare: 0 },
];

// IRE rail config — specialized for IRE (Independent Review Entity) track; mirrors IRO
// but surfaced distinctly for volume routing, metrics, and prompt specialization.
const IRE_STEPS: LaborStep[] = [
  ...UM_STEPS.filter((s) => s.id !== 'clinical_review' && s.id !== 'determination'),
  { id: 'independence_enforcement', label: 'Reviewer independence enforcement (IRE)', weight: 1, engineShare: 1 },
  { id: 'independent_review', label: 'Independent reviewer review (IRE)', weight: 10, engineShare: 4 },
  { id: 'determination', label: 'Independent determination (IRE)', weight: 4, engineShare: 0 },
];

const STREAM_STEPS: Record<LaborStream, LaborStep[]> = {
  um: UM_STEPS,
  medical_review: MEDICAL_REVIEW_STEPS,
  payer_idr: IDR_STEPS,
  iro: IRO_STEPS,
  ire: IRE_STEPS,
};

/** The canonical estimated step table for a stream (defensive copy). */
export function stepsForStream(stream: LaborStream): LaborStep[] {
  return (STREAM_STEPS[stream] ?? STREAM_STEPS.um).map((s) => ({ ...s }));
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * THE canonical formula. engine ÷ total, with hybrid splits already baked into
 * each step's engineShare. labor_reduction + human_judgment always sum to 100.
 */
export function computeLaborMetric(stream: LaborStream, steps: LaborStep[]): LaborMetricResult {
  const engine_lu = steps.reduce((a, s) => a + Math.min(s.engineShare, s.weight), 0);
  const total_lu = steps.reduce((a, s) => a + s.weight, 0);
  const human_lu = total_lu - engine_lu;
  const ratio = total_lu > 0 ? engine_lu / total_lu : 0;
  const labor_reduction_pct = round(ratio * 100);
  return {
    stream,
    engine_lu,
    human_lu,
    total_lu,
    labor_reduction_pct,
    human_judgment_pct: 100 - labor_reduction_pct,
    labor_reduction_ratio: ratio,
    weights_basis: WEIGHTS_BASIS,
  };
}

/**
 * Per-case metric from the canonical estimated table for its stream. When live
 * per-step actuals exist (e.g. the engine's extraction was corrected by a human),
 * pass `overrides` mapping stepId → engineShare to reflect what actually happened.
 */
export function computeLaborMetricForCase(
  input: { case_type?: string | null; stream?: LaborStream },
  overrides?: Record<string, number>,
): LaborMetricResult {
  const stream: LaborStream =
    input.stream ??
    (input.case_type === 'payer_idr'
      ? 'payer_idr'
      : input.case_type === 'ire'
      ? 'ire'
      : input.case_type === 'iro'
        ? 'iro'
        : input.case_type === 'medical_review'
          ? 'medical_review'
          : 'um');
  const steps = stepsForStream(stream).map((s) =>
    overrides && overrides[s.id] !== undefined
      ? { ...s, engineShare: Math.max(0, Math.min(overrides[s.id], s.weight)) }
      : s,
  );
  return computeLaborMetric(stream, steps);
}

// ── Confidence-resolution metric ──────────────────────────────────────────────

export type BriefDirection = 'approve' | 'deny' | 'modify';

export interface ConfidenceInput {
  /** Engine's directional confidence in its brief recommendation, 0–100. */
  directional_confidence: number;
  /** Did the engine produce a complete evidentiary brief? */
  brief_complete: boolean;
  /** The engine's directional recommendation, if any. */
  recommendation?: BriefDirection | null;
}

/**
 * Per case: did the engine lift it to ≥85% directional confidence (approve/deny/
 * modify) with a complete evidentiary brief? This is a property of the ENGINE's
 * brief, independent of the human's final determination.
 */
export function isConfidenceResolved(x: ConfidenceInput): boolean {
  return (
    x.directional_confidence >= CONFIDENCE_THRESHOLD &&
    x.brief_complete === true &&
    !!x.recommendation &&
    (x.recommendation === 'approve' || x.recommendation === 'deny' || x.recommendation === 'modify')
  );
}

/** Book-level rate: % of inbound cases that are confidence-resolved. */
export function confidenceResolutionRate(cases: ConfidenceInput[]): number {
  if (cases.length === 0) return 0;
  const resolved = cases.filter(isConfidenceResolved).length;
  return round((resolved / cases.length) * 100);
}

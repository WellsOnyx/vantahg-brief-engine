/**
 * Ambient learning — the compounding-advantage loop.
 *
 * Every case that flows through VantaUM produces a triple: what the AI
 * brief recommended, what the licensed human decided, and (when the
 * partner's system tells us) what ultimately happened downstream — paid,
 * appealed, overturned, exhausted. Captured per tenant, that triple is the
 * training signal that makes the engine sharper for THAT payer's book over
 * time: their criteria interpretations, their edge cases, their overturn
 * patterns. Switching cost compounds monthly because a competitor starts
 * from zero calibration.
 *
 * THREE HARD RULES, enforced by design not discipline:
 *
 * 1. THE WALL IS UNTOUCHED. Learning tunes what the AI *drafts and flags*.
 *    It never tunes, biases, or automates the human decision. There is no
 *    code path where a learned signal renders a determination — a licensed
 *    clinician still decides every case with rationale + attestation. The
 *    learning store is read by the BRIEF generator (advisory), never by any
 *    determination writer.
 *
 * 2. TENANT-ISOLATED. A signal learned from client A never influences
 *    client B's briefs. Every record and every calibration read is scoped
 *    by client_id. Cross-tenant pattern sharing, if ever desired, is a
 *    separate, explicitly-consented, de-identified aggregate — not this.
 *
 * 3. PHI-SAFE PROVENANCE. Learning records store case_id + coded features
 *    (procedure/diagnosis codes, criteria ids, decision, outcome) — never
 *    names, DOBs, member ids, or narrative. The features are exactly the
 *    structured fields already in the case row; nothing new about the
 *    patient is retained.
 *
 * Everything metric-shaped surfaces under the estimated_pending_calibration
 * label until a tenant has enough resolved outcomes to be meaningful.
 */

export type LearningDecision = 'approve' | 'deny' | 'partial_approve' | 'modify' | 'pend';

/** What the world told us happened after we returned a determination. */
export type DownstreamOutcome =
  | 'paid' // claim adjudicated/paid consistent with our determination
  | 'appealed' // provider/member appealed
  | 'overturned' // our determination was reversed on appeal/IRO
  | 'upheld' // determination upheld on appeal/IRO
  | 'withdrawn' // request withdrawn
  | 'exhausted' // appeals exhausted, determination stands
  | 'unknown';

/**
 * One learning record per case, appended as facts arrive (the AI rec at
 * brief time, the human decision at determination, the outcome when the
 * partner reports it via the Partner API acknowledge/outcome channel).
 * Coded features only — see rule 3.
 */
export interface LearningRecord {
  id: string;
  client_id: string; // tenant scope — rule 2
  case_id: string;
  case_type: string;
  review_type: string;
  service_category: string | null;
  procedure_codes: string[];
  diagnosis_codes: string[];
  criteria_ids: string[]; // e.g. InterQual/MCG rule identifiers the brief cited
  ai_recommendation: LearningDecision | null;
  ai_confidence: 'low' | 'medium' | 'high' | null;
  human_decision: LearningDecision | null;
  /** Did the human agree with the AI's recommendation? Null until decided. */
  concordance: boolean | null;
  downstream_outcome: DownstreamOutcome;
  brief_generated_at: string | null;
  decided_at: string | null;
  outcome_reported_at: string | null;
}

/**
 * Per-tenant, per-context calibration derived from resolved LearningRecords.
 * This is the ONLY thing the brief generator reads back — advisory priors
 * that sharpen extraction emphasis and criteria selection, never a verdict.
 */
export interface CalibrationSignal {
  client_id: string;
  /** Context key the signal applies to, e.g. "um:prior_auth:imaging" or a CPT prefix. */
  context: string;
  sample_size: number;
  /** How often the human agreed with the AI rec in this context (0..1). */
  concordance_rate: number | null;
  /** How often our determinations were overturned downstream (0..1) — the humility signal. */
  overturn_rate: number | null;
  /** Criteria ids that most often accompanied a human override — "look harder here". */
  high_override_criteria: string[];
  /** Always labeled until the tenant has enough resolved outcomes. */
  calibration: 'estimated_pending_calibration' | 'calibrated';
  computed_at: string;
}

/** Minimum resolved outcomes before a context graduates from estimated → calibrated. */
export const CALIBRATION_MIN_SAMPLE = 200;

export function calibrationLabel(sampleSize: number): CalibrationSignal['calibration'] {
  return sampleSize >= CALIBRATION_MIN_SAMPLE ? 'calibrated' : 'estimated_pending_calibration';
}

/**
 * Guard asserted at every learning-store WRITE and every calibration READ:
 * the wall holds. A determination-writing code path must never import the
 * calibration reader, and the calibration reader must never be handed a
 * determination context. This is a type-level marker + a runtime assertion
 * point (see lib/learning/store) — cheap insurance on the most important
 * invariant in the product.
 */
export type LearningConsumer = 'brief_generator'; // the ONLY allowed reader of calibration
export function assertAdvisoryOnly(consumer: LearningConsumer): void {
  if (consumer !== 'brief_generator') {
    throw new Error(
      'Ambient learning is advisory-only: calibration may be read solely by the brief generator, never by a determination path. The wall holds.',
    );
  }
}

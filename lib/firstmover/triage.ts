/**
 * First Mover triage rules engine.
 *
 * Takes a case and returns a routing decision: which reviewer lane it
 * should land in, what priority it should run at, and a human-readable
 * list of reasons. The MVP version is deterministic heuristics; the L2
 * version will replace this with an AI classifier that calls the
 * Anthropic API on Haiku for cheap routing.
 *
 * Lanes (in increasing complexity):
 *   - csr_review: defects (missing fields, eligibility issues, dup fingerprint)
 *   - lpn:        low-complexity standard auths (clean imaging, routine DME, simple home health)
 *   - rn:         medium-complexity (medications, partial-criteria, continued-stay)
 *   - md:         high-complexity (inpatient initial, oncology, transplant, behavioral health,
 *                 high-cost, expedited, peer-to-peer requested)
 *   - auto_approve: reserved for future use; never returned in v1
 *
 * The rules are intentionally conservative — when in doubt, escalate. False
 * negatives (LPN gets an MD-level case) cost more than false positives
 * (MD gets a simple case).
 */

import type { Case } from '@/lib/types';

export type TriageLane = 'csr_review' | 'lpn' | 'rn' | 'md' | 'auto_approve';
export type TriagePriority = 'standard' | 'urgent' | 'expedited';

export interface TriageDecision {
  case_id: string;
  lane: TriageLane;
  priority: TriagePriority;
  /** Human-readable reasons this case landed in the assigned lane. */
  reasons: string[];
  /** 0..1 — how confident the rule engine is. 1 = unambiguous, 0.5 = borderline. */
  confidence: number;
  /** When set, this case has a hard reason it can't proceed (e.g., red eligibility). */
  blocker?: string;
}

const HIGH_COMPLEXITY_CATEGORIES = new Set([
  'oncology',
  'transplant',
  'behavioral_health',
  'cardiology',
  'genetic_testing',
  'pain_management',
]);

const MEDIUM_COMPLEXITY_CATEGORIES = new Set([
  'home_health',
  'skilled_nursing',
  'rehab_therapy',
  'infusion',
]);

const LOW_COMPLEXITY_CATEGORIES = new Set([
  'imaging',
  'specialty_referral',
  'dme',
]);

// CPT codes commonly associated with high-cost or high-complexity procedures.
// Conservative starter list; real list lives with the medical director.
const HIGH_COST_CPT_PATTERNS = [
  /^33/,    // cardiac surgery
  /^61/,    // neurosurgery
  /^7820/,  // PET imaging
  /^8136/,  // genetic testing
  /^J9/,    // chemotherapy infusions (HCPCS)
  /^Q5/,    // biosimilars / specialty drugs (HCPCS)
];

const HIGH_RISK_DIAGNOSIS_PATTERNS = [
  /^C\d/,   // ICD-10 C00-C97: malignant neoplasms
  /^F2\d/,  // ICD-10 F20-F29: schizophrenia spectrum
  /^F3[01234]/, // F30-F34: mood disorders, severe
];

interface TriageContext {
  /** Whether the case has an unresolved eligibility hard-stop (red dot). */
  eligibility_red?: boolean;
  /** Whether intake validation flagged missing fields. */
  has_missing_fields?: boolean;
  /** Whether dedup matched another case in the last 24h. */
  duplicate_fingerprint?: boolean;
  /** Now, for testability. */
  now?: Date;
}

export function triageCase(c: Partial<Case> & { id?: string }, ctx: TriageContext = {}): TriageDecision {
  const reasons: string[] = [];
  const now = ctx.now ?? new Date();

  // ── Stage 1: defects / blockers route to CSR ──────────────────────────
  if (ctx.eligibility_red) {
    return {
      case_id: c.id || '',
      lane: 'csr_review',
      priority: 'standard',
      reasons: ['Eligibility red dot — must verify with TPA before proceeding.'],
      confidence: 1,
      blocker: 'eligibility_red',
    };
  }
  if (ctx.has_missing_fields) {
    return {
      case_id: c.id || '',
      lane: 'csr_review',
      priority: 'standard',
      reasons: ['Required fields missing.'],
      confidence: 1,
      blocker: 'missing_fields',
    };
  }
  if (ctx.duplicate_fingerprint) {
    return {
      case_id: c.id || '',
      lane: 'csr_review',
      priority: 'standard',
      reasons: ['Duplicate fingerprint within 24h — verify before opening.'],
      confidence: 1,
      blocker: 'duplicate',
    };
  }

  // ── Stage 2: priority assignment ──────────────────────────────────────
  let priority: TriagePriority = (c.priority as TriagePriority) || 'standard';
  const facilityType = c.facility_type;
  const serviceCategory = c.service_category;
  const cptCodes = c.procedure_codes || [];
  const dxCodes = c.diagnosis_codes || [];

  if (facilityType === 'inpatient') {
    priority = priority === 'standard' ? 'urgent' : priority;
    reasons.push('Inpatient — urgent priority.');
  }
  if (serviceCategory && HIGH_COMPLEXITY_CATEGORIES.has(serviceCategory) && priority === 'standard') {
    if (serviceCategory === 'oncology' || serviceCategory === 'transplant') {
      priority = 'urgent';
      reasons.push(`${serviceCategory} — urgent priority.`);
    }
  }

  // Already-flagged expedited via SLA risk
  const deadline = c.turnaround_deadline ? new Date(c.turnaround_deadline) : null;
  if (deadline) {
    const hoursLeft = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (hoursLeft <= 24 && hoursLeft > 0) {
      reasons.push(`SLA <24h — expedited handling.`);
      priority = 'expedited';
    } else if (hoursLeft <= 0) {
      reasons.push('SLA breached — escalate immediately.');
      priority = 'expedited';
    }
  }

  // ── Stage 3: lane assignment by complexity ────────────────────────────

  // MD lane triggers (any one is sufficient)
  const mdReasons: string[] = [];

  if (facilityType === 'inpatient') mdReasons.push('Inpatient initial review.');
  if (priority === 'expedited') mdReasons.push('Expedited (72h) timeline.');
  if (c.review_type === 'peer_to_peer') mdReasons.push('Peer-to-peer requested.');
  if (c.review_type === 'appeal' || c.review_type === 'second_level_review') mdReasons.push('Appeal / second-level review.');

  if (serviceCategory && HIGH_COMPLEXITY_CATEGORIES.has(serviceCategory)) {
    mdReasons.push(`High-complexity service category: ${serviceCategory}.`);
  }
  if (cptCodes.some((code) => HIGH_COST_CPT_PATTERNS.some((re) => re.test(code)))) {
    mdReasons.push('High-cost / high-complexity CPT code.');
  }
  if (dxCodes.some((code) => HIGH_RISK_DIAGNOSIS_PATTERNS.some((re) => re.test(code)))) {
    mdReasons.push('High-risk diagnosis code.');
  }

  if (mdReasons.length > 0) {
    return {
      case_id: c.id || '',
      lane: 'md',
      priority,
      reasons: [...reasons, ...mdReasons],
      confidence: mdReasons.length >= 2 ? 1 : 0.85,
    };
  }

  // RN lane triggers
  const rnReasons: string[] = [];

  if (c.review_type === 'concurrent') rnReasons.push('Concurrent / continued-stay review.');
  if (serviceCategory && MEDIUM_COMPLEXITY_CATEGORIES.has(serviceCategory)) {
    rnReasons.push(`Medium-complexity service category: ${serviceCategory}.`);
  }
  if (c.intake_service_type === 'medication') rnReasons.push('Medication authorization.');

  if (rnReasons.length > 0) {
    return {
      case_id: c.id || '',
      lane: 'rn',
      priority,
      reasons: [...reasons, ...rnReasons],
      confidence: 0.85,
    };
  }

  // LPN lane (default for low-complexity standard auths)
  const lpnReasons: string[] = [];
  if (serviceCategory && LOW_COMPLEXITY_CATEGORIES.has(serviceCategory)) {
    lpnReasons.push(`Low-complexity service: ${serviceCategory}.`);
  } else {
    lpnReasons.push('Default routing for standard outpatient prior auth.');
  }

  return {
    case_id: c.id || '',
    lane: 'lpn',
    priority,
    reasons: [...reasons, ...lpnReasons],
    confidence: 0.75,
  };
}

/**
 * Bulk-triage a batch of cases. Returns the same shape per case;
 * caller decides whether to apply or just preview.
 */
export function triageBatch(
  cases: Array<{ case: Partial<Case> & { id?: string }; ctx?: TriageContext }>
): TriageDecision[] {
  return cases.map(({ case: c, ctx }) => triageCase(c, ctx));
}

/**
 * Map a triage lane to the existing reviewer-role taxonomy used by the
 * queue and assignment engines. This keeps the lane abstraction local
 * to the triage module while interoperating with the rest of the app.
 */
export function laneToReviewerRole(lane: TriageLane): 'lpn' | 'rn' | 'md' | 'admin' {
  switch (lane) {
    case 'lpn':
      return 'lpn';
    case 'rn':
      return 'rn';
    case 'md':
      return 'md';
    case 'csr_review':
    case 'auto_approve':
    default:
      return 'admin';
  }
}

export function summarizeBatch(decisions: TriageDecision[]): {
  total: number;
  byLane: Record<TriageLane, number>;
  byPriority: Record<TriagePriority, number>;
  blocked: number;
  averageConfidence: number;
} {
  const byLane: Record<TriageLane, number> = {
    csr_review: 0, lpn: 0, rn: 0, md: 0, auto_approve: 0,
  };
  const byPriority: Record<TriagePriority, number> = {
    standard: 0, urgent: 0, expedited: 0,
  };
  let blocked = 0;
  let confSum = 0;

  for (const d of decisions) {
    byLane[d.lane] += 1;
    byPriority[d.priority] += 1;
    if (d.blocker) blocked += 1;
    confSum += d.confidence;
  }

  return {
    total: decisions.length,
    byLane,
    byPriority,
    blocked,
    averageConfidence: decisions.length > 0 ? confSum / decisions.length : 0,
  };
}

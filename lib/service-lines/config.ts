/**
 * Service lines — the five products, each with a distinct pipeline shape,
 * cost center, and price basis. This is the spine the throughput model and
 * the P&L both roll up through: a case's service_line decides which engine
 * stages it consumes (hence where it bottlenecks and what it costs) and
 * which cost center + rate card it books against.
 *
 * The load-bearing distinction is WHERE OUR PIPELINE STOPS:
 *   - Lines that include a clinical/arbiter determination on OUR side
 *     consume the human review queue (LPN/RN/MD, panel, IRO reviewer,
 *     attorney) — the expensive, capacity-bounded stage.
 *   - UM-without-Med-Review stops after the brief + concierge gate and
 *     HANDS THE PACKET to the client's in-house medical reviewers. We
 *     never touch a clinical queue, so our throughput ceiling and our
 *     cost structure for that line are fundamentally different (engine +
 *     concierge only).
 *   - Credentialing is not a clinical case at all — a separate PSV +
 *     committee workflow (see docs/CREDENTIALING_PLAN.md). It shares the
 *     intake + queue chassis but none of the clinical stages.
 *
 * Every rate here is a placeholder wired to a cost_center + price_basis;
 * real numbers come from the calibrated cost model and the signed rate
 * card. Nothing here sets a price — it sets the STRUCTURE prices attach to.
 */

import type { LaborStream } from '@/lib/labor-metric';

export type ServiceLineKey =
  | 'um_with_mr' // 1. UM, clinical determination on our side
  | 'um_without_mr' // 2. UM, brief prep only — client's in-house MRs decide
  | 'iro_ire' // 3. Independent external review (state IRO / federal IRE)
  | 'idr' // 4. Payer IDR (No Surprises Act arbitration)
  | 'credentialing'; // 5. Provider credentialing / re-credentialing (non-clinical)

/** Which shared engine stage a line consumes — drives the throughput model. */
export type PipelineStage =
  | 'intake' // webhook/API accept + persist (all lines)
  | 'extraction' // OCR + AI field extraction (clinical lines)
  | 'dedup' // fingerprint dedup (clinical lines)
  | 'brief' // AI brief generation — the Anthropic-bound stage (clinical lines)
  | 'concierge_gate' // human validation of the brief (lines we prep)
  | 'clinical_review' // OUR nurse/MD/panel/arbiter queue (capacity-bounded)
  | 'psv' // primary-source verification (credentialing only)
  | 'committee' // credentialing committee review (credentialing only)
  | 'determination' // decision recorded (whoever owns it)
  | 'delivery'; // letter/decision out + acknowledge

/** Who owns the terminal decision — sets whether the costly queue is ours. */
export type DeterminationOwner = 'vantaum_clinician' | 'vantaum_attorney' | 'external_reviewer' | 'client_in_house' | 'vantaum_committee';

/** Rate cards attach to these; keeping cost centers explicit keeps the P&L honest. */
export type CostCenter =
  | 'cc_um_full' // full clinical stack (nurse + MD tiers)
  | 'cc_um_prep' // engine + concierge only (no clinical labor)
  | 'cc_external_review' // IRO/IRE reviewer network + independence ops
  | 'cc_idr' // attorney/arbitration
  | 'cc_credentialing'; // PSV vendors + committee ops

export type PriceBasis =
  | 'per_authorization'
  | 'per_review'
  | 'per_case'
  | 'per_provider'
  | 'pmpm_component';

export interface ServiceLine {
  key: ServiceLineKey;
  label: string;
  /** Maps to the clinical case discriminator (null for credentialing — not a case_type). */
  labor_stream: LaborStream | null;
  cost_center: CostCenter;
  price_basis: PriceBasis;
  determination_owner: DeterminationOwner;
  /** Ordered engine stages THIS line consumes on our side. */
  stages: PipelineStage[];
  /** Does the costly, capacity-bounded human queue live on our side? */
  consumes_our_review_queue: boolean;
  /** Where our pipeline stops and (if applicable) hands off. */
  handoff: 'none' | 'client_in_house_mr' | 'external_reviewer';
  /** Regulatory clock, informational — drives SLA config, not throughput math. */
  regulatory_sla: string | null;
  notes: string;
}

const CLINICAL_PREP: PipelineStage[] = ['intake', 'extraction', 'dedup', 'brief', 'concierge_gate'];

export const SERVICE_LINES: Record<ServiceLineKey, ServiceLine> = {
  um_with_mr: {
    key: 'um_with_mr',
    label: 'UM with Medical Review',
    labor_stream: 'medical_review',
    cost_center: 'cc_um_full',
    price_basis: 'per_authorization',
    determination_owner: 'vantaum_clinician',
    stages: [...CLINICAL_PREP, 'clinical_review', 'determination', 'delivery'],
    consumes_our_review_queue: true,
    handoff: 'none',
    regulatory_sla: 'Plan/CMS turnaround (e.g. 72h expedited / 14d standard)',
    notes: 'Full stack: engine preps, our LPN/RN/MD tier decides. Highest touch, highest cost center, richest price.',
  },
  um_without_mr: {
    key: 'um_without_mr',
    label: 'UM without Medical Review (client in-house MRs)',
    labor_stream: 'um',
    cost_center: 'cc_um_prep',
    price_basis: 'per_authorization',
    determination_owner: 'client_in_house',
    // Stops after the concierge gate — the prepared packet is handed to the
    // client's own medical reviewers; we never run a clinical queue.
    stages: [...CLINICAL_PREP, 'delivery'],
    consumes_our_review_queue: false,
    handoff: 'client_in_house_mr',
    regulatory_sla: 'Client-owned (their MRs carry the clock)',
    notes: 'Brief-prep product: engine + concierge assemble a decision-ready packet, client decides. No clinical labor on our side → the highest-margin, highest-throughput line for us. Different cost center (cc_um_prep) and lower price than um_with_mr.',
  },
  iro_ire: {
    key: 'iro_ire',
    label: 'IRO / IRE (independent external review)',
    labor_stream: 'iro',
    cost_center: 'cc_external_review',
    price_basis: 'per_review',
    determination_owner: 'external_reviewer',
    stages: [...CLINICAL_PREP, 'clinical_review', 'determination', 'delivery'],
    consumes_our_review_queue: true, // an INDEPENDENT reviewer, with the independence wall
    handoff: 'external_reviewer',
    regulatory_sla: 'State IRO / federal IRE statutory windows (often 45d standard / 72h expedited)',
    notes: 'Independence wall enforced (reviewer must have no prior involvement). Reviewer network is the cost center. Priced per review, regulated turnaround.',
  },
  idr: {
    key: 'idr',
    label: 'IDR (No Surprises Act payment arbitration)',
    labor_stream: 'ire', // IDR shares the arbitration lifecycle stream; see labor-metric IDR_STEPS
    cost_center: 'cc_idr',
    price_basis: 'per_case',
    determination_owner: 'vantaum_attorney',
    stages: ['intake', 'extraction', 'dedup', 'brief', 'clinical_review', 'determination', 'delivery'],
    consumes_our_review_queue: true, // attorney tier, not clinical
    handoff: 'none',
    regulatory_sla: 'NSA IDR timelines (offer/counter windows, 30-business-day determination)',
    notes: 'NSA weight-of-evidence brief + attorney determination (QPA vs offers). Attorney cost center, priced per arbitration case.',
  },
  credentialing: {
    key: 'credentialing',
    label: 'Credentialing / Re-credentialing',
    labor_stream: null, // NOT a clinical case — separate workflow
    cost_center: 'cc_credentialing',
    price_basis: 'per_provider',
    determination_owner: 'vantaum_committee',
    stages: ['intake', 'psv', 'committee', 'determination', 'delivery'],
    consumes_our_review_queue: false, // its own PSV + committee queues, not the clinical tier
    handoff: 'none',
    regulatory_sla: 'NCQA CR standards; re-credentialing ≤ 36 months; payer turnaround SLAs',
    notes: 'Primary-source verification + committee decision. Shares intake/queue chassis, none of the clinical stages. See docs/CREDENTIALING_PLAN.md — net-new build.',
  },
};

export const SERVICE_LINE_KEYS = Object.keys(SERVICE_LINES) as ServiceLineKey[];

export function getServiceLine(key: ServiceLineKey): ServiceLine {
  return SERVICE_LINES[key];
}

/** The lines whose expensive human queue lives on our side — the capacity-planning set. */
export function linesConsumingReviewQueue(): ServiceLine[] {
  return SERVICE_LINE_KEYS.map((k) => SERVICE_LINES[k]).filter((l) => l.consumes_our_review_queue);
}

/** Every line touches the brief/AI stage except credentialing — the Anthropic-bound throughput set. */
export function linesConsumingBriefStage(): ServiceLine[] {
  return SERVICE_LINE_KEYS.map((k) => SERVICE_LINES[k]).filter((l) => l.stages.includes('brief'));
}

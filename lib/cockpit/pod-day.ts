/**
 * Demo seed for the Cockpit "Pod Day Gauntlet" walkthrough (internal buy-in demo).
 * Deterministic synthetic data — one full pod day across the four gauntlet stops:
 * CX make-whole → arbiter certify → physician batch clear → DL-MD purity telemetry.
 *
 * Labor telemetry is computed through the CANONICAL module (lib/labor-metric.ts)
 * so the demo shows the real formula, not hand-typed numbers.
 */
import {
  computeLaborMetricForCase,
  confidenceResolutionRate,
  isConfidenceResolved,
  type LaborMetricResult,
  type LaborStream,
  type BriefDirection,
} from '@/lib/labor-metric';

export type GauntletStop = 'cx' | 'arbiter' | 'physician' | 'dl_md';

export interface PodPerson {
  id: string;
  name: string;
  credential: string;
  role: string;
}

export interface PodCase {
  id: string;
  case_number: string;
  patient: string;
  procedure: string;
  stream: LaborStream;
  /** Which gauntlet stop this case is sitting at. */
  stop: GauntletStop;
  directional_confidence: number; // 0-100
  brief_complete: boolean;
  recommendation: BriefDirection | null;
  /** Missing items CX must resolve to make the file whole (empty = whole). */
  missing: string[];
  independent: boolean; // reviewer independence held
  sla_minutes_remaining: number;
  labor: LaborMetricResult;
  confidence_resolved: boolean;
}

export interface PodTelemetry {
  cases: number;
  avg_labor_reduction_pct: number;
  confidence_resolution_rate: number;
  independence_purity_pct: number; // % of re-reviews assigned to an independent reviewer
  sla_purity_pct: number; // % still inside SLA
  engine_lu: number;
  human_lu: number;
}

export interface PodDay {
  date_label: string;
  pod: string;
  cx: PodPerson;
  arbiter: PodPerson;
  physician: PodPerson;
  delivery_lead: PodPerson;
  cases: PodCase[];
  telemetry: PodTelemetry;
}

function mkCase(
  seed: Omit<PodCase, 'labor' | 'confidence_resolved'>,
): PodCase {
  const labor = computeLaborMetricForCase({ case_type: seed.stream });
  const confidence_resolved = isConfidenceResolved({
    directional_confidence: seed.directional_confidence,
    brief_complete: seed.brief_complete,
    recommendation: seed.recommendation,
  });
  return { ...seed, labor, confidence_resolved };
}

const CX: PodPerson = { id: 'cx-01', name: 'Rosa Delgado', credential: 'Concierge CSR', role: 'Intake' };
const ARBITER: PodPerson = { id: 'arb-01', name: 'Marcus Hale, RN', credential: 'Certifying Arbiter', role: 'Certification' };
const MD: PodPerson = { id: 'md-01', name: 'Dr. Priya Anand', credential: 'MD, Physician Reviewer', role: 'Determination' };
const DL: PodPerson = { id: 'dl-01', name: 'Dr. Samuel Okafor', credential: 'Delivery Lead / MD', role: 'Command' };

const RAW_CASES: Omit<PodCase, 'labor' | 'confidence_resolved'>[] = [
  // ── CX make-whole stop: files arriving incomplete, CX resolving gaps ──
  { id: 'c1', case_number: 'VUM-CARD-0412', patient: 'M. Santos', procedure: 'MRI lumbar 72148', stream: 'um', stop: 'cx',
    directional_confidence: 61, brief_complete: false, recommendation: null,
    missing: ['Conservative-therapy notes', 'Prior imaging report'], independent: true, sla_minutes_remaining: 174 },
  { id: 'c2', case_number: 'VUM-ORTH-0413', patient: 'J. Rivera', procedure: 'TKA 27447', stream: 'um', stop: 'cx',
    directional_confidence: 74, brief_complete: false, recommendation: null,
    missing: ['KL grade documentation'], independent: true, sla_minutes_remaining: 208 },

  // ── Arbiter certify stop: files made whole, awaiting certification ──
  { id: 'c3', case_number: 'VUM-CARD-0409', patient: 'A. Whitfield', procedure: 'Cardiac cath 93458', stream: 'iro', stop: 'arbiter',
    directional_confidence: 88, brief_complete: true, recommendation: 'deny',
    missing: [], independent: true, sla_minutes_remaining: 96 },
  { id: 'c4', case_number: 'VUM-GI-0408', patient: 'L. Moreno', procedure: 'Colonoscopy 45378', stream: 'um', stop: 'arbiter',
    directional_confidence: 91, brief_complete: true, recommendation: 'approve',
    missing: [], independent: true, sla_minutes_remaining: 132 },

  // ── Physician batch clear stop: certified, ready for determination ──
  { id: 'c5', case_number: 'VUM-CARD-0401', patient: 'R. Garcia', procedure: 'Infliximab J1745', stream: 'um', stop: 'physician',
    directional_confidence: 93, brief_complete: true, recommendation: 'approve', missing: [], independent: true, sla_minutes_remaining: 41 },
  { id: 'c6', case_number: 'VUM-ORTH-0402', patient: 'G. Kim', procedure: 'Knee arthroscopy 29881', stream: 'um', stop: 'physician',
    directional_confidence: 89, brief_complete: true, recommendation: 'approve', missing: [], independent: true, sla_minutes_remaining: 38 },
  { id: 'c7', case_number: 'VUM-PULM-0403', patient: 'T. Nguyen', procedure: 'CPAP E0601', stream: 'um', stop: 'physician',
    directional_confidence: 96, brief_complete: true, recommendation: 'approve', missing: [], independent: true, sla_minutes_remaining: 55 },
  { id: 'c8', case_number: 'VUM-CARD-0404', patient: 'P. Patel', procedure: 'Stress echo 93350', stream: 'um', stop: 'physician',
    directional_confidence: 87, brief_complete: true, recommendation: 'modify', missing: [], independent: true, sla_minutes_remaining: 47 },

  // ── DL-MD purity telemetry stop: cleared / delivered today ──
  { id: 'c9', case_number: 'VUM-IRO-0405', patient: 'D. Hale', procedure: 'Spinal fusion 22633', stream: 'iro', stop: 'dl_md',
    directional_confidence: 90, brief_complete: true, recommendation: 'deny', missing: [], independent: true, sla_minutes_remaining: 0 },
  { id: 'c10', case_number: 'VUM-IDR-0406', patient: 'B. Cole', procedure: 'OON facility claim', stream: 'payer_idr', stop: 'dl_md',
    directional_confidence: 85, brief_complete: true, recommendation: 'modify', missing: [], independent: true, sla_minutes_remaining: 0 },
];

export function telemetryFrom(cases: PodCase[]): PodTelemetry {
  const n = cases.length;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const engine_lu = cases.reduce((a, c) => a + c.labor.engine_lu, 0);
  const human_lu = cases.reduce((a, c) => a + c.labor.human_lu, 0);
  return {
    cases: n,
    avg_labor_reduction_pct: avg(cases.map((c) => c.labor.labor_reduction_pct)),
    confidence_resolution_rate: confidenceResolutionRate(
      cases.map((c) => ({
        directional_confidence: c.directional_confidence,
        brief_complete: c.brief_complete,
        recommendation: c.recommendation,
      })),
    ),
    independence_purity_pct: Math.round((cases.filter((c) => c.independent).length / n) * 100),
    sla_purity_pct: Math.round(
      (cases.filter((c) => c.stop === 'dl_md' || c.sla_minutes_remaining > 0).length / n) * 100,
    ),
    engine_lu,
    human_lu,
  };
}

export function getPodDay(): PodDay {
  const cases = RAW_CASES.map(mkCase);
  return {
    date_label: 'Pod Day — Southwest Administrators',
    pod: 'Cardio-Ortho Pod 3',
    cx: CX,
    arbiter: ARBITER,
    physician: MD,
    delivery_lead: DL,
    cases,
    telemetry: telemetryFrom(cases),
  };
}

export const GAUNTLET: { id: GauntletStop; label: string; sub: string; who: (d: PodDay) => PodPerson }[] = [
  { id: 'cx', label: 'Make the file whole', sub: 'Concierge intake', who: (d) => d.cx },
  { id: 'arbiter', label: 'Certify', sub: 'Arbiter', who: (d) => d.arbiter },
  { id: 'physician', label: 'Clear the batch', sub: 'Physician reviewer', who: (d) => d.physician },
  { id: 'dl_md', label: 'Purity telemetry', sub: 'Delivery Lead / MD', who: (d) => d.delivery_lead },
];

export function casesForStop(day: PodDay, stop: GauntletStop): PodCase[] {
  return day.cases.filter((c) => c.stop === stop);
}

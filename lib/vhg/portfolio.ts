import { DEMO_MONTHS, DEMO_STATES, ENTITLED_CLIENT_ID, FACILITIES, SERVICE_LINES, VHG_PORTFOLIO_COUNT } from './catalog';
import { demoCriteriaFor } from './criteria-demo';
import { billedToQpaRatio } from './redact';
import { intBetween, mulberry32, pick } from './rng';
import { scoreVhgCase } from './score';
import type { MedReviewDemoCase, MedReviewPanel, VhgScoreInput } from './types';

export const FEATURED: MedReviewDemoCase[] = [
  {
    case_token: 'vhg-mr-0101',
    case_number: 'MR-SYN-0101',
    client_id: ENTITLED_CLIENT_ID,
    service_month: '2026-08',
    member_token: 'TOK-0101',
    summary: 'Synthetic adult member. Unscheduled visit. Service month 2026-08. Direct identifiers are not in this demo packet.',
    service_line: 'Emergency medicine',
    specialty: 'emergency_medicine',
    cpt: '99285',
    state: 'TX',
    facility_type: 'freestanding_er',
    encounter: 'emergency',
    network_status: 'out_of_network',
    billed_amount: 8400,
    qpa_amount: 980,
  },
  {
    case_token: 'vhg-mr-0102',
    case_number: 'MR-SYN-0102',
    client_id: ENTITLED_CLIENT_ID,
    service_month: '2026-07',
    member_token: 'TOK-0102',
    summary: 'Synthetic adult member. Scheduled imaging visit. Service month 2026-07. Direct identifiers are not in this demo packet.',
    service_line: 'Radiology',
    specialty: 'radiology',
    cpt: '70553',
    state: 'FL',
    facility_type: 'hospital',
    encounter: 'scheduled',
    network_status: 'out_of_network',
    billed_amount: 4200,
    qpa_amount: 1800,
  },
  {
    case_token: 'vhg-mr-0103',
    case_number: 'MR-SYN-0103',
    client_id: ENTITLED_CLIENT_ID,
    service_month: '2026-06',
    member_token: 'TOK-0103',
    summary: 'Synthetic adult member. Scheduled office visit. Service month 2026-06. Direct identifiers are not in this demo packet.',
    service_line: 'Orthopedics',
    specialty: 'orthopedics',
    cpt: '99213',
    state: 'MN',
    facility_type: 'office',
    encounter: 'scheduled',
    network_status: 'in_network',
    billed_amount: 280,
    qpa_amount: 250,
  },
  {
    case_token: 'vhg-mr-0104',
    case_number: 'MR-SYN-0104',
    client_id: ENTITLED_CLIENT_ID,
    service_month: '2026-09',
    member_token: 'TOK-0104',
    summary: 'Synthetic adult member. Air transport. Service month 2026-09. Direct identifiers are not in this demo packet.',
    service_line: 'Air ambulance',
    specialty: 'air_ambulance',
    cpt: 'A0431',
    state: 'AZ',
    facility_type: 'hospital',
    encounter: 'emergency',
    network_status: 'out_of_network',
    billed_amount: 42000,
    qpa_amount: 6100,
  },
];

function toInput(row: MedReviewDemoCase): VhgScoreInput {
  return {
    network_status: row.network_status,
    specialty: row.specialty,
    cpt: row.cpt,
    service_line: row.service_line,
    billed_amount: row.billed_amount,
    qpa_amount: row.qpa_amount,
    state: row.state,
    facility_type: row.facility_type,
    encounter: row.encounter,
  };
}

function buildGenerated(): MedReviewDemoCase[] {
  const rng = mulberry32(20260921);
  const rows: MedReviewDemoCase[] = [];
  for (let i = FEATURED.length; i < VHG_PORTFOLIO_COUNT; i += 1) {
    const n = String(i + 1).padStart(4, '0');
    const line = pick(rng, SERVICE_LINES);
    const encounter = rng() < 0.38 ? 'emergency' : 'scheduled';
    const network = rng() < 0.64 ? 'out_of_network' : 'in_network';
    const qpa = intBetween(rng, 350, 9000);
    const ratio = network === 'out_of_network' ? 1.2 + rng() * 6.5 : 0.85 + rng() * 1.2;
    const facility = encounter === 'emergency' && rng() < 0.4 ? 'freestanding_er' : pick(rng, FACILITIES);
    rows.push({
      case_token: `vhg-mr-${n}`,
      case_number: `MR-SYN-${n}`,
      client_id: ENTITLED_CLIENT_ID,
      service_month: pick(rng, DEMO_MONTHS),
      member_token: `TOK-${n}`,
      summary: `Synthetic adult member. ${encounter === 'emergency' ? 'Unscheduled' : 'Scheduled'} ${line.service_line.toLowerCase()} encounter. Direct identifiers are not in this demo packet.`,
      service_line: line.service_line,
      specialty: line.specialty,
      cpt: pick(rng, line.cpts),
      state: pick(rng, DEMO_STATES),
      facility_type: facility,
      encounter,
      network_status: network,
      billed_amount: Math.round(qpa * ratio),
      qpa_amount: qpa,
    });
  }
  return rows;
}

let cached: MedReviewDemoCase[] | null = null;

/** De-identified med-review cases for the entitled synthetic client. */
export function getMedReviewPortfolio(): MedReviewDemoCase[] {
  if (!cached) cached = [...FEATURED, ...buildGenerated()];
  return cached;
}

export function getMedReviewDemoCase(caseToken: string): MedReviewDemoCase | null {
  return getMedReviewPortfolio().find((row) => row.case_token === caseToken) ?? null;
}

export function panelFromCase(row: MedReviewDemoCase, illustrative: boolean): MedReviewPanel {
  const input = toInput(row);
  return {
    illustrative,
    illustrative_note: illustrative
      ? 'Illustrative synthetic profile for this demo. Features are not read from the clinical packet.'
      : null,
    case_token: row.case_token,
    case_number: row.case_number,
    service_month: row.service_month,
    member_token: row.member_token,
    summary: row.summary,
    service_line: row.service_line,
    specialty: row.specialty,
    cpt: row.cpt,
    state: row.state,
    facility_type: row.facility_type,
    encounter: row.encounter,
    network_status: row.network_status,
    billed_amount: row.billed_amount,
    qpa_amount: row.qpa_amount,
    billed_to_qpa_ratio: billedToQpaRatio(row.billed_amount, row.qpa_amount),
    criteria: demoCriteriaFor(input),
    score: scoreVhgCase(input),
  };
}

function hashToken(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Known demo tokens return that case. Any other id gets a stable synthetic
 * illustration so a med-review screen can show the panel without reading PHI.
 */
export function resolveMedReviewPanel(caseToken: string): MedReviewPanel {
  const found = getMedReviewDemoCase(caseToken);
  if (found) return panelFromCase(found, false);
  const portfolio = getMedReviewPortfolio();
  const donor = portfolio[hashToken(caseToken) % portfolio.length];
  return panelFromCase(
    {
      ...donor,
      case_token: caseToken,
      case_number: `MR-SYN-${caseToken.slice(0, 8)}`,
      member_token: 'TOK-ILLUSTRATIVE',
      summary: 'Illustrative synthetic profile. Direct identifiers are not in this demo packet.',
    },
    true,
  );
}

export function projectedExposureUsd(row: MedReviewDemoCase): number {
  const score = scoreVhgCase(toInput(row));
  if (score.band !== 'high') return 0;
  return Math.max(0, row.billed_amount - row.qpa_amount);
}

import { DEMO_STATES, FACILITIES, SERVICE_LINES, VHG_PATTERN_COUNT } from './catalog';
import { intBetween, mulberry32, pick } from './rng';
import type { IdrOutcome, SyntheticIdrRecord } from './types';

const FIRST = ['Avery', 'Blake', 'Casey', 'Drew', 'Elliot', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jules'];
const LAST = ['North', 'West', 'Lake', 'Field', 'Stone', 'Brook', 'Dale', 'Grove', 'Hill', 'Marsh'];

/** Fixed canary so tests can prove this exact string never survives redaction. */
const CANARY: SyntheticIdrRecord = {
  source_record_id: 'raw-canary',
  patient_name: 'Zebediah Quillstone',
  date_of_birth: '1954-03-22',
  member_id: 'MBR-CANARY-88421',
  street: '88421 Canary Lane',
  city: 'Canaryville',
  postal_code: 'Z9CAN',
  provider_person_name: 'Dr. Canary Personlink',
  provider_npi: '1999999999',
  claim_number: 'CLM-CANARY-7731',
  service_date: '2026-01-17',
  dispute_opened_date: '2026-02-03',
  network_status: 'out_of_network',
  specialty: 'emergency_medicine',
  cpt: '99285',
  service_line: 'Emergency medicine',
  billed_amount: 6400,
  qpa_amount: 900,
  state: 'TX',
  facility_type: 'freestanding_er',
  encounter: 'emergency',
  idr_outcome: 'provider_win',
  initiating_party: 'provider',
};

function outcomeFor(rng: () => number, outOfNetwork: boolean, emergency: boolean, ratio: number): IdrOutcome {
  let provider = 0.34;
  if (outOfNetwork) provider += 0.18;
  if (emergency) provider += 0.08;
  if (ratio >= 4) provider += 0.12;
  const roll = rng();
  if (roll < provider) return 'provider_win';
  if (roll < provider + 0.22) return 'settled';
  return 'payer_win';
}

function buildOne(rng: () => number, index: number): SyntheticIdrRecord {
  const line = pick(rng, SERVICE_LINES);
  const encounter = rng() < 0.42 ? 'emergency' : 'scheduled';
  const network = rng() < 0.72 ? 'out_of_network' : 'in_network';
  const qpa = intBetween(rng, 400, 8000);
  const ratio = network === 'out_of_network' ? 1.4 + rng() * 7 : 0.9 + rng() * 1.6;
  const billed = Math.round(qpa * ratio);
  const year = rng() < 0.5 ? 2025 : 2026;
  const month = intBetween(rng, 1, year === 2026 ? 9 : 12);
  const day = intBetween(rng, 1, 27);
  const service = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const disputeDay = Math.min(27, day + intBetween(rng, 10, 20));
  const disputeMonth = Math.min(12, month + (disputeDay === day ? 1 : intBetween(rng, 0, 1)));
  const dispute = `${year}-${String(disputeMonth).padStart(2, '0')}-${String(disputeDay).padStart(2, '0')}`;
  const birthYear = intBetween(rng, 1946, 2004);
  const n = String(index).padStart(4, '0');

  return {
    source_record_id: `raw-${n}`,
    patient_name: `${pick(rng, FIRST)} ${pick(rng, LAST)} ${n}`,
    date_of_birth: `${birthYear}-${String(intBetween(rng, 1, 12)).padStart(2, '0')}-${String(intBetween(rng, 1, 27)).padStart(2, '0')}`,
    member_id: `MBR-SYN-${n}-${intBetween(rng, 10000, 99999)}`,
    street: `${intBetween(rng, 100, 9899)} Synthetic Ave Apt ${index}`,
    city: `Synthetic City ${index}`,
    postal_code: `Z${n}`,
    provider_person_name: `Dr. Synthetic Provider ${n}`,
    provider_npi: `19${String(10000000 + index).padStart(8, '0')}`.slice(0, 10),
    claim_number: `CLM-SYN-${n}-${intBetween(rng, 100000, 999999)}`,
    service_date: service,
    dispute_opened_date: dispute,
    network_status: network,
    specialty: line.specialty,
    cpt: pick(rng, line.cpts),
    service_line: line.service_line,
    billed_amount: billed,
    qpa_amount: qpa,
    state: pick(rng, DEMO_STATES),
    facility_type: encounter === 'emergency' && rng() < 0.35 ? 'freestanding_er' : pick(rng, FACILITIES),
    encounter,
    idr_outcome: outcomeFor(rng, network === 'out_of_network', encounter === 'emergency', billed / qpa),
    initiating_party: rng() < 0.86 ? 'provider' : 'plan',
  };
}

let cached: SyntheticIdrRecord[] | null = null;

/**
 * ~200 identifiable synthetic rows used only to prove redaction.
 * Not a training input for the Likely IDR Contested Score.
 */
export function getSyntheticIdrRecords(): SyntheticIdrRecord[] {
  if (cached) return cached;
  const rng = mulberry32(20260513);
  const rows: SyntheticIdrRecord[] = [CANARY];
  for (let i = 1; i < VHG_PATTERN_COUNT; i += 1) {
    rows.push(buildOne(rng, i));
  }
  cached = rows;
  return rows;
}

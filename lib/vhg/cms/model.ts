import type { VhgScoreInput } from '../types';
import type { CmsDispersionCell, CmsFeatureRates, CmsRateCell } from './rates';

/**
 * Scales on empirical log-lifts from the public table.
 * The display intercept and temperature are fit to public anchor profiles
 * in `fitDisplay`, not to private disputes.
 */
export const PUBLIC_LIFT_SCALE = {
  out_of_network: 0.35,
  in_network: -2.55,
  service_code: 0.62,
  prevailing: 0.85,
  state: 0.5,
  place: 0.48,
  provider_type: 0.4,
  offer_band: 2.4,
  dispersion: 1.35,
} as const;

export const OFFER_BANDS = [
  { id: 'under_1_5', label: 'under 1.5× QPA', min: 0, max: 1.5 },
  { id: 'under_2_5', label: '1.5–2.5× QPA', min: 1.5, max: 2.5 },
  { id: 'under_5', label: '2.5–5× QPA', min: 2.5, max: 5 },
  { id: 'over_5', label: 'over 5× QPA', min: 5, max: Number.POSITIVE_INFINITY },
] as const;

export type OfferBandId = (typeof OFFER_BANDS)[number]['id'];

export interface ScoreTerm {
  key: string;
  label: string;
  weight: number;
  detail: string;
}

export interface DisplayFit {
  intercept: number;
  temperature: number;
}

const PUF_PERIODS = '2024 Q3, 2024 Q4, and 2025 Q4';

function clip(rate: number): number {
  return Math.min(0.98, Math.max(0.02, rate));
}

function logit(rate: number): number {
  const value = clip(rate);
  return Math.log(value / (1 - value));
}

function logLift(share: number, baseline: number): number {
  return Math.log((Math.max(share, 1e-8)) / Math.max(baseline, 1e-8));
}

export function offerBandForRatio(ratio: number): (typeof OFFER_BANDS)[number] {
  return OFFER_BANDS.find((band) => ratio >= band.min && ratio < band.max) ?? OFFER_BANDS[3];
}

export function caseTypeForInput(input: VhgScoreInput): string {
  const code = input.cpt.toUpperCase();
  if (input.specialty === 'air_ambulance' || code.startsWith('A043')) return 'air_ambulance';
  if (input.encounter === 'emergency' || input.facility_type === 'freestanding_er') return 'emergency';
  if (code === '99281' || code === '99282' || code === '99283' || code === '99284' || code === '99285' || code === '99291' || code === '99292') {
    return 'emergency';
  }
  return 'non_emergency';
}

export function placeForInput(input: VhgScoreInput): string {
  if (caseTypeForInput(input) === 'air_ambulance') return '42';
  if (input.encounter === 'emergency' || input.facility_type === 'freestanding_er') return '23';
  if (input.facility_type === 'asc') return '24';
  if (input.facility_type === 'office') return '11';
  return '21';
}

export function providerBucket(input: VhgScoreInput): string {
  if (caseTypeForInput(input) === 'air_ambulance') return 'air_ambulance';
  const known = [
    'emergency_medicine',
    'radiology',
    'anesthesiology',
    'pathology',
    'orthopedics',
    'cardiology',
    'air_ambulance',
  ];
  return known.includes(input.specialty) ? input.specialty : 'other';
}

function shrinkRate(n: number, rate: number | null, priorN: number, prior: number): number {
  const observed = rate ?? prior;
  return (n * observed + priorN * prior) / (n + priorN);
}

function findCell<T extends CmsRateCell>(rows: T[], pred: (row: T) => boolean): T | undefined {
  return rows.find(pred);
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function placeLabel(pos: string): string {
  const names: Record<string, string> = {
    '11': 'office (11)',
    '21': 'inpatient hospital (21)',
    '22': 'outpatient hospital (22)',
    '23': 'emergency room (23)',
    '24': 'ambulatory surgical center (24)',
    '42': 'ambulance air or water (42)',
  };
  return names[pos] ?? `place of service ${pos}`;
}

export function dispersionFor(input: VhgScoreInput, rates: CmsFeatureRates): CmsDispersionCell | null {
  const code = input.cpt.toUpperCase();
  const caseType = caseTypeForInput(input);
  return (
    rates.arbiter_dispersion.find(
      (cell) => cell.service_code === code && cell.state === input.state && cell.case_type === caseType,
    ) ?? null
  );
}

function supplementalSpecialtyNote(bucket: string, rates: CmsFeatureRates): string {
  const name: Record<string, string> = {
    emergency_medicine: 'Emergency Department',
    radiology: 'Radiology',
    anesthesiology: 'Anesthesia',
    pathology: 'Pathology',
    cardiology: 'Cardiovascular',
    air_ambulance: 'Air Ambulance',
  };
  const label = name[bucket];
  if (!label) return '';
  const row = rates.supplemental.specialties
    .filter((item) => item.period === '2025-Q4' && item.specialty.includes(label) && item.median_prevailing_offer_pct_of_qpa != null)
    .sort((a, b) => b.payment_determinations - a.payment_determinations)[0];
  if (!row || row.median_prevailing_offer_pct_of_qpa == null) return '';
  return ` CMS supplemental Table 14 (2025 Q4): median prevailing offer for ${row.specialty} was ${Math.round(row.median_prevailing_offer_pct_of_qpa)}% of QPA.`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0.01;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function publicTerms(input: VhgScoreInput, rates: CmsFeatureRates, ratio: number): ScoreTerm[] {
  const overall = rates.baselines.overall_provider_prevailing_rate ?? rates.provider_prevailing_rate ?? 0.5;
  const code = findCell(rates.service_codes, (row) => row.code === input.cpt.toUpperCase());
  const bucketId = providerBucket(input);
  const bucket = findCell(rates.provider_type_buckets, (row) => row.bucket === bucketId);
  const codeShare = code?.share ?? bucket?.share ?? rates.baselines.service_code_median_share ?? 0.001;
  const codeN = code?.n ?? 0;
  const shrunkShare = code && code.n >= 200
    ? code.share
    : (codeN * codeShare + 200 * (bucket?.share ?? codeShare)) / (codeN + 200);
  const codeBaseline = rates.baselines.service_code_median_share ?? shrunkShare;
  const codeWin = shrinkRate(code?.n ?? 0, code?.provider_prevailing_rate ?? null, 200, overall);
  const serviceWeight =
    PUBLIC_LIFT_SCALE.service_code * logLift(shrunkShare, codeBaseline) +
    PUBLIC_LIFT_SCALE.prevailing * (logit(codeWin) - logit(overall));

  const initiationShares = Object.values(rates.supplemental.state_initiation_share);
  const stateBaseline = initiationShares.length > 0
    ? median(initiationShares)
    : (rates.baselines.state_median_share ?? 0.02);
  const stateShare = rates.supplemental.state_initiation_share[input.state]
    ?? findCell(rates.states, (row) => row.state === input.state)?.share
    ?? stateBaseline;
  const stateCell = findCell(rates.states, (row) => row.state === input.state);
  const stateWin = shrinkRate(stateCell?.n ?? 0, stateCell?.provider_prevailing_rate ?? null, 500, overall);
  const stateWeight =
    PUBLIC_LIFT_SCALE.state * logLift(stateShare, stateBaseline) +
    0.25 * (logit(stateWin) - logit(overall));

  const pos = placeForInput(input);
  const place = findCell(rates.places, (row) => row.pos === pos);
  // The unfiltered median is a rare place-of-service code (share ~0). Compare
  // against places that actually appear in the public files (n >= 1,000).
  const substantivePlaces = rates.places.filter((row) => row.n >= 1000);
  const placeBaseline = substantivePlaces.length >= 3
    ? median(substantivePlaces.map((row) => row.share))
    : (rates.baselines.place_median_share ?? place?.share ?? 0.05);
  const placeShare = place?.share ?? placeBaseline;
  const placeWeight = PUBLIC_LIFT_SCALE.place * logLift(placeShare, placeBaseline);

  const specialtyNote = supplementalSpecialtyNote(bucketId, rates);
  const typeBaseline = rates.baselines.provider_type_median_share ?? bucket?.share ?? 0.05;
  const typeShare = bucket?.share ?? typeBaseline;
  const typeWin = shrinkRate(bucket?.n ?? 0, bucket?.provider_prevailing_rate ?? null, 200, overall);
  const typeWeight =
    PUBLIC_LIFT_SCALE.provider_type * logLift(typeShare, typeBaseline) +
    0.35 * (logit(typeWin) - logit(overall));

  const band = offerBandForRatio(ratio);
  const bandCell = findCell(rates.offer_to_qpa_bands, (row) => row.band === band.id);
  const bandBaseline = median(rates.offer_to_qpa_bands.map((row) => row.share).filter((share) => share > 0));
  const bandShare = bandCell?.share ?? bandBaseline;
  const bandWin = shrinkRate(bandCell?.n ?? 0, bandCell?.provider_prevailing_rate ?? null, 200, overall);
  const bandWeight =
    PUBLIC_LIFT_SCALE.offer_band * (logit(bandWin) - logit(overall)) +
    0.2 * logLift(bandShare, bandBaseline || bandShare);

  const dispersion = dispersionFor(input, rates);
  const dispersionBaseline = rates.baselines.dispersion_median ?? 0;
  const dispersionWeight = dispersion
    ? PUBLIC_LIFT_SCALE.dispersion * (dispersion.outcome_dispersion - dispersionBaseline)
    : 0;

  const networkWeight = input.network_status === 'out_of_network'
    ? PUBLIC_LIFT_SCALE.out_of_network
    : PUBLIC_LIFT_SCALE.in_network;

  const periods = rates.supplemental.periods.join(', ') || PUF_PERIODS;
  const codeNText = code ? code.n.toLocaleString('en-US') : 'no exact code row';
  const codeRateText = code?.provider_prevailing_rate == null ? 'n/a' : percent(code.provider_prevailing_rate);

  return [
    {
      key: 'network_status',
      label: input.network_status === 'out_of_network' ? 'Out-of-network provider' : 'In-network provider',
      weight: networkWeight,
      detail: input.network_status === 'out_of_network'
        ? '45 CFR 149.510: federal IDR is for qualified out-of-network items. CMS public IDR files are those disputes.'
        : '45 CFR 149.510: in-network care is outside the federal IDR path, so this public-data score stays low.',
    },
    {
      key: 'service_code',
      label: 'Service code',
      weight: serviceWeight,
      detail: `CMS Federal IDR PUF (${PUF_PERIODS}): CPT ${input.cpt.toUpperCase()} has ${codeNText} published line items and a provider prevailing rate of ${codeRateText}.`,
    },
    {
      key: 'state',
      label: 'State',
      weight: stateWeight,
      detail: `CMS supplemental initiations (${periods}): ${input.state} is ${percent(stateShare)} of published dispute initiations.`,
    },
    {
      key: 'place_of_service',
      label: 'Place of service',
      weight: placeWeight,
      detail: `CMS Federal IDR PUF: ${placeLabel(pos)} is ${percent(placeShare)} of published line items${place ? ` (n=${place.n.toLocaleString('en-US')})` : ''}.`,
    },
    {
      key: 'provider_type',
      label: 'Provider type',
      weight: typeWeight,
      detail: `CMS Federal IDR PUF provider-type bucket “${bucketId.replaceAll('_', ' ')}” is ${percent(typeShare)} of published line items${bucket?.provider_prevailing_rate == null ? '' : `, provider prevailing rate ${percent(bucket.provider_prevailing_rate)}`}.${specialtyNote}`,
    },
    {
      key: 'offer_to_qpa',
      label: 'Offer-to-QPA band',
      weight: bandWeight,
      detail: `Billed ÷ QPA is ${ratio.toFixed(2)} (${band.label}). In the CMS Federal IDR PUF that offer-to-QPA band has provider prevailing rate ${bandCell?.provider_prevailing_rate == null ? 'n/a' : percent(bandCell.provider_prevailing_rate)} (n=${(bandCell?.n ?? 0).toLocaleString('en-US')}).`,
    },
    {
      key: 'outcome_dispersion',
      label: 'Public outcome dispersion',
      weight: dispersionWeight,
      detail: dispersion
        ? `CMS Federal IDR PUF 2025 Q4: outcome dispersion is ${dispersion.outcome_dispersion.toFixed(3)} across ${dispersion.n_entities} certified entities for this service code, state, and case type. Entity names are not used.`
        : 'No public outcome-dispersion cell for this service code, state, and case type.',
    },
  ];
}

export function rawLogOdds(terms: ScoreTerm[]): number {
  return terms.reduce((sum, term) => sum + term.weight, 0);
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function scoreFromLogOdds(logOdds: number, fit: DisplayFit): number {
  const z = fit.intercept + logOdds / fit.temperature;
  return Math.max(0, Math.min(100, Math.round(sigmoid(z) * 100)));
}

function bucketForCode(code: string, rates: CmsFeatureRates): string {
  if (code.startsWith('A043')) return 'air_ambulance';
  if (/^9928[1-8]$/.test(code) || code === '99291' || code === '99292') return 'emergency_medicine';
  const emergency = rates.provider_type_buckets.find((row) => row.bucket === 'emergency_medicine');
  if (emergency && code.startsWith('992')) return 'emergency_medicine';
  return 'other';
}

/**
 * Places 0–100 on two public profiles:
 * the modal out-of-network dispute in the files, and an in-network office
 * visit in a low-volume state. Not fit on private disputes or demo packets.
 * Targets are display anchors (80 and 20), not estimated filing probabilities.
 */
export function fitDisplay(rates: CmsFeatureRates): DisplayFit {
  const rankedStates = Object.entries(rates.supplemental.state_initiation_share)
    .filter(([, share]) => share > 0)
    .sort((a, b) => b[1] - a[1]);
  const topState = rankedStates[0]?.[0] ?? 'TX';
  const initiations = rates.supplemental.state_initiations;
  const lowVolumeStates = rankedStates.filter(([code]) => (initiations[code] ?? 0) >= 1000);
  const lowState = lowVolumeStates[lowVolumeStates.length - 1]?.[0] ?? rankedStates[rankedStates.length - 1]?.[0] ?? 'MN';
  const modalBand = [...rates.offer_to_qpa_bands].sort((a, b) => b.n - a.n)[0]?.band ?? 'under_1_5';
  const bandRatio: Record<string, number> = { under_1_5: 1.2, under_2_5: 2, under_5: 3.5, over_5: 6.5 };
  const highRatio = bandRatio[modalBand] ?? 1.2;
  const highCode = rates.service_codes[0]?.code ?? '99284';
  const rareCodes = rates.service_codes.filter((row) => row.n >= 100 && row.n <= 800);
  const lowCode = rareCodes[rareCodes.length - 1]?.code ?? rates.service_codes[rates.service_codes.length - 1]?.code ?? '99213';
  const high: VhgScoreInput = {
    network_status: 'out_of_network',
    specialty: bucketForCode(highCode, rates),
    cpt: highCode,
    service_line: 'Public anchor',
    billed_amount: Math.round(1000 * highRatio),
    qpa_amount: 1000,
    state: topState,
    facility_type: 'freestanding_er',
    encounter: 'emergency',
  };
  const low: VhgScoreInput = {
    network_status: 'in_network',
    specialty: bucketForCode(lowCode, rates),
    cpt: lowCode,
    service_line: 'Public anchor',
    billed_amount: 280,
    qpa_amount: 250,
    state: lowState,
    facility_type: 'office',
    encounter: 'scheduled',
  };
  const zh = rawLogOdds(publicTerms(high, rates, highRatio));
  const zi = rawLogOdds(publicTerms(low, rates, 1.12));
  const spread = Math.max(0.5, zh - zi);
  const logitHigh = logit(0.8);
  const logitLow = logit(0.2);
  const temperature = Math.min(8, Math.max(1.2, spread / (logitHigh - logitLow)));
  const intercept = logitHigh - zh / temperature;
  return { intercept, temperature };
}

let fitCache: { rates: CmsFeatureRates; fit: DisplayFit } | null = null;

export function displayFit(rates: CmsFeatureRates): DisplayFit {
  if (fitCache?.rates === rates) return fitCache.fit;
  const fit = fitDisplay(rates);
  fitCache = { rates, fit };
  return fit;
}

export function marginalPoints(logOdds: number, weight: number, fit: DisplayFit): number {
  const full = scoreFromLogOdds(logOdds, fit);
  const without = scoreFromLogOdds(logOdds - weight, fit);
  return full - without;
}

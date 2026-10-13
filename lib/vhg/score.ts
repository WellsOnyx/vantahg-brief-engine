import { getRedactedIdrPatterns } from './patterns';
import { billedToQpaRatio } from './redact';
import type { RedactedIdrPattern, VhgBand, VhgPatternLookup, VhgScore, VhgScoreDriver, VhgScoreInput } from './types';
import { VHG_SCORE_ADVISORY } from './types';

/**
 * Hand-set demo weights. Not fit on live IDR filings.
 * Exported so a reviewer can read every term that moves the score.
 */
export const DEMO_WEIGHTS = {
  intercept: -1.35,
  out_of_network: 0.95,
  emergency: 0.4,
  ratio: { under_1_5: -0.45, under_2_5: 0.05, under_5: 0.55, over_5: 1.15 },
  facility: { hospital: 0.22, asc: 0.05, office: -0.35, freestanding_er: 0.45 },
  specialty: {
    emergency_medicine: 0.35,
    anesthesiology: 0.3,
    radiology: 0.2,
    pathology: 0.18,
    air_ambulance: 0.55,
    orthopedics: 0.08,
    cardiology: 0.12,
  } as Record<string, number>,
  state: {
    TX: 0.15,
    FL: 0.1,
    AZ: 0.12,
    NJ: 0.1,
    NY: 0.08,
    CA: 0.06,
    MN: -0.1,
  } as Record<string, number>,
  /** Applied only when the redacted pattern sample has at least this many rows. */
  history_min_n: 8,
  history_scale: 0.7,
} as const;

export function bandForScore(score: number): VhgBand {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function ratioWeight(ratio: number): { weight: number; label: string } {
  if (ratio < 1.5) return { weight: DEMO_WEIGHTS.ratio.under_1_5, label: 'under 1.5× QPA' };
  if (ratio < 2.5) return { weight: DEMO_WEIGHTS.ratio.under_2_5, label: '1.5–2.5× QPA' };
  if (ratio < 5) return { weight: DEMO_WEIGHTS.ratio.under_5, label: '2.5–5× QPA' };
  return { weight: DEMO_WEIGHTS.ratio.over_5, label: 'over 5× QPA' };
}

interface Term {
  key: string;
  label: string;
  weight: number;
  detail: string;
}

function lookupPatterns(input: VhgScoreInput, patterns: RedactedIdrPattern[]): VhgPatternLookup {
  const tight = patterns.filter(
    (row) =>
      row.service_line === input.service_line &&
      row.state === input.state &&
      row.network_status === input.network_status &&
      row.encounter === input.encounter,
  );
  const loose = patterns.filter(
    (row) => row.service_line === input.service_line && row.network_status === input.network_status,
  );
  const chosen = tight.length >= 3 ? tight : loose.length > 0 ? loose : [];
  const match_level: VhgPatternLookup['match_level'] =
    tight.length >= 3 ? 'service_line_state_network_encounter' : loose.length > 0 ? 'service_line_network' : 'none';
  const provider_wins = chosen.filter((row) => row.idr_outcome === 'provider_win').length;
  const payer_wins = chosen.filter((row) => row.idr_outcome === 'payer_win').length;
  const settled = chosen.filter((row) => row.idr_outcome === 'settled').length;
  return {
    match_level,
    sample_size: chosen.length,
    provider_wins,
    payer_wins,
    settled,
    provider_win_rate: chosen.length === 0 ? null : Math.round((provider_wins / chosen.length) * 100) / 100,
  };
}

function historyWeight(lookup: VhgPatternLookup): number {
  if (lookup.sample_size < DEMO_WEIGHTS.history_min_n || lookup.provider_win_rate == null) return 0;
  return (lookup.provider_win_rate - 0.5) * DEMO_WEIGHTS.history_scale;
}

function marginalPoints(z: number, weight: number): number {
  const full = sigmoid(z);
  const without = sigmoid(z - weight);
  return Math.round((full - without) * 100);
}

/**
 * Transparent logistic-style score. Demo model, not validated.
 * Looks up redacted IDR patterns for the historical win/loss driver.
 */
export function scoreVhgCase(input: VhgScoreInput, patterns: RedactedIdrPattern[] = getRedactedIdrPatterns()): VhgScore {
  const ratio = billedToQpaRatio(input.billed_amount, input.qpa_amount);
  const ratioTerm = ratioWeight(ratio);
  const lookup = lookupPatterns(input, patterns);
  const history = historyWeight(lookup);
  const facilityWeight = DEMO_WEIGHTS.facility[input.facility_type];
  const specialtyWeight = DEMO_WEIGHTS.specialty[input.specialty] ?? 0;
  const stateWeight = DEMO_WEIGHTS.state[input.state] ?? 0;
  const networkWeight = input.network_status === 'out_of_network' ? DEMO_WEIGHTS.out_of_network : 0;
  const encounterWeight = input.encounter === 'emergency' ? DEMO_WEIGHTS.emergency : 0;

  const terms: Term[] = [
    {
      key: 'network_status',
      label: input.network_status === 'out_of_network' ? 'Out-of-network provider' : 'In-network provider',
      weight: networkWeight,
      detail:
        input.network_status === 'out_of_network'
          ? 'Out-of-network encounters are the cases that can reach federal IDR.'
          : 'In-network care is outside the usual federal IDR path in this demo.',
    },
    {
      key: 'encounter',
      label: input.encounter === 'emergency' ? 'Emergency encounter' : 'Scheduled encounter',
      weight: encounterWeight,
      detail:
        input.encounter === 'emergency'
          ? 'Emergency setting adds dispute likelihood in this demo baseline.'
          : 'Scheduled care does not add the emergency term.',
    },
    {
      key: 'billed_to_qpa',
      label: 'Billed-to-QPA ratio',
      weight: ratioTerm.weight,
      detail: `Synthetic billed ÷ QPA is ${ratio.toFixed(2)} (${ratioTerm.label}).`,
    },
    {
      key: 'facility_type',
      label: 'Facility type',
      weight: facilityWeight,
      detail: `Facility type on the synthetic packet: ${input.facility_type.replaceAll('_', ' ')}.`,
    },
    {
      key: 'service_line',
      label: 'Service line / CPT',
      weight: specialtyWeight,
      detail: `${input.service_line} · CPT ${input.cpt}.`,
    },
    {
      key: 'state',
      label: 'State',
      weight: stateWeight,
      detail: `State on the synthetic packet: ${input.state}.`,
    },
    {
      key: 'historical_pattern',
      label: 'Historical win/loss pattern',
      weight: history,
      detail:
        lookup.sample_size === 0
          ? 'No redacted IDR patterns matched this service line.'
          : `${lookup.sample_size} redacted patterns (${lookup.match_level.replaceAll('_', ' ')}): ${lookup.provider_wins} provider wins, ${lookup.payer_wins} payer wins, ${lookup.settled} settled.`,
    },
  ];

  const z =
    DEMO_WEIGHTS.intercept +
    terms.reduce((sum, term) => sum + term.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(sigmoid(z) * 100)));

  const drivers: VhgScoreDriver[] = terms
    .map((term) => {
      const points = marginalPoints(z, term.weight);
      return {
        key: term.key,
        label: term.label,
        direction: points >= 0 ? 'increases' : 'decreases',
        points,
        detail: term.detail,
      } satisfies VhgScoreDriver;
    })
    .filter((driver) => driver.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  return {
    score,
    band: bandForScore(score),
    drivers,
    pattern_lookup: lookup,
    model_id: 'vhg-score-demo-v1',
    model_status: 'demo_not_validated',
    label: 'VHG Score',
    trademark: 'TM',
    advisory: VHG_SCORE_ADVISORY,
  };
}

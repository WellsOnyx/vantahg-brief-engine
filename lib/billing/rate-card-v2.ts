/**
 * Rate card v2.0 — the only dollar source in this repo.
 *
 * Locked commercial lines as data, not UI copy. Service-line keys on
 * the existing UM products attach to the UM PEPM. Additional product
 * lines are catalog config only — they do not create runtime workflows.
 *
 * Per-review is never hourly except disease_management_engaged_hourly.
 * Do not invent a $12 PEPM. Marketing routes must not import this.
 */

import type { ServiceLineKey } from '@/lib/service-lines/config';

export type RateUnit =
  | 'pepm'
  | 'pppm'
  | 'per_review'
  | 'per_episode'
  | 'per_engaged'
  | 'per_hour'
  | 'percent_of_verified_allowed'
  | 'percent_of_savings'
  | 'surcharge_multiplier'
  | 'same_as_underlying_review';

export type RateCardLineKey =
  | 'um_pepm'
  | 'readmission'
  | 'care_management'
  | 'nurse_line'
  | 'disease_management_pepm'
  | 'disease_management_engaged'
  | 'disease_management_engaged_hourly'
  | 'nurse_review'
  | 'md_review'
  | 'specialist_review'
  | 'p2p_md'
  | 'p2p_followup'
  | 'expedite'
  | 'appeals'
  | 'high_dollar'
  | 'tpa_only_reprice'
  | 'dialysis'
  | 'maternity';

export interface RateCardLine {
  key: RateCardLineKey;
  label: string;
  /** Locked amount. Percents and the expedite surcharge are ratios (0.225 = 22.5%). */
  amount: number;
  unit: RateUnit;
  /** True only for the explicit DM engaged hourly rate. */
  hourly: boolean;
  /** Utilization corridor (UM PEPM). */
  corridor?: number;
  /** High-dollar: claw back if verified allowed does not hold. */
  clawback?: boolean;
  notes?: string;
}

export const RATE_CARD_VERSION = '2.0';

/**
 * UM $2.50 PEPM applies to both UM settings (with MR / without MR).
 * Corridor 1.65 is the locked utilization band on that PEPM.
 */
export const UM_PEPM_USD = 2.5;
export const UM_PEPM_CENTS = 250;
export const UM_CORRIDOR = 1.65;

export const RATE_CARD: Record<RateCardLineKey, RateCardLine> = {
  um_pepm: {
    key: 'um_pepm',
    label: 'Utilization Management PEPM',
    amount: UM_PEPM_USD,
    unit: 'pepm',
    hourly: false,
    corridor: UM_CORRIDOR,
    notes: 'Same $2.50 PEPM for um_with_mr and um_without_mr. Corridor 1.65.',
  },
  readmission: {
    key: 'readmission',
    label: 'Readmission',
    amount: 0.95,
    unit: 'pepm',
    hourly: false,
  },
  care_management: {
    key: 'care_management',
    label: 'Care Management',
    amount: 3.75,
    unit: 'pepm',
    hourly: false,
  },
  nurse_line: {
    key: 'nurse_line',
    label: 'Nurse line',
    amount: 0.75,
    unit: 'pepm',
    hourly: false,
  },
  disease_management_pepm: {
    key: 'disease_management_pepm',
    label: 'Disease management PEPM',
    amount: 1.95,
    unit: 'pepm',
    hourly: false,
  },
  disease_management_engaged: {
    key: 'disease_management_engaged',
    label: 'Disease management engaged',
    amount: 175,
    unit: 'per_engaged',
    hourly: false,
  },
  disease_management_engaged_hourly: {
    key: 'disease_management_engaged_hourly',
    label: 'Disease management engaged hourly',
    amount: 145,
    unit: 'per_hour',
    hourly: true,
    notes: 'The only hourly rate on the card.',
  },
  nurse_review: {
    key: 'nurse_review',
    label: 'Nurse review',
    amount: 55,
    unit: 'per_review',
    hourly: false,
  },
  md_review: {
    key: 'md_review',
    label: 'MD review',
    amount: 250,
    unit: 'per_review',
    hourly: false,
  },
  specialist_review: {
    key: 'specialist_review',
    label: 'Specialist review',
    amount: 300,
    unit: 'per_review',
    hourly: false,
  },
  p2p_md: {
    key: 'p2p_md',
    label: 'Peer-to-peer (MD)',
    amount: 225,
    unit: 'per_review',
    hourly: false,
  },
  p2p_followup: {
    key: 'p2p_followup',
    label: 'Peer-to-peer (follow-up)',
    amount: 150,
    unit: 'per_review',
    hourly: false,
  },
  expedite: {
    key: 'expedite',
    label: 'Expedite surcharge',
    amount: 0.25,
    unit: 'surcharge_multiplier',
    hourly: false,
    notes: '+25% on the underlying review rate.',
  },
  appeals: {
    key: 'appeals',
    label: 'Appeals',
    amount: 0,
    unit: 'same_as_underlying_review',
    hourly: false,
    notes: 'Billed at the same rate as the underlying review. No separate dollar.',
  },
  high_dollar: {
    key: 'high_dollar',
    label: 'High-dollar',
    amount: 0.225,
    unit: 'percent_of_verified_allowed',
    hourly: false,
    clawback: true,
    notes: '22.5% of verified allowed, with clawback.',
  },
  tpa_only_reprice: {
    key: 'tpa_only_reprice',
    label: 'TPA-only reprice',
    amount: 0.15,
    unit: 'percent_of_savings',
    hourly: false,
  },
  dialysis: {
    key: 'dialysis',
    label: 'Dialysis',
    amount: 3500,
    unit: 'pppm',
    hourly: false,
  },
  maternity: {
    key: 'maternity',
    label: 'Maternity',
    amount: 850,
    unit: 'per_episode',
    hourly: false,
    notes: 'Locked $850 per episode; not hourly. Catalog only — no maternity workflow in this PR.',
  },
};

export const RATE_CARD_LINE_KEYS = Object.keys(RATE_CARD) as RateCardLineKey[];

/** Existing runtime service lines that have a locked v2.0 dollar. Others stay unpriced. */
export const SERVICE_LINE_RATE_KEYS: Partial<Record<ServiceLineKey, RateCardLineKey>> = {
  um_with_mr: 'um_pepm',
  um_without_mr: 'um_pepm',
};

/** Product-line keys that are catalog-only (no new runtime workflow). */
export const PRODUCT_LINE_KEYS = [
  'readmission',
  'care_management',
  'nurse_line',
  'disease_management',
  'nurse_review',
  'md_review',
  'specialist_review',
  'p2p',
  'expedite',
  'appeals',
  'high_dollar',
  'tpa_only_reprice',
  'dialysis',
  'maternity',
] as const;

export function getRateCardLine(key: RateCardLineKey): RateCardLine {
  return RATE_CARD[key];
}

export function rateForServiceLine(key: ServiceLineKey): RateCardLine | null {
  const lineKey = SERVICE_LINE_RATE_KEYS[key];
  return lineKey ? RATE_CARD[lineKey] : null;
}

export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

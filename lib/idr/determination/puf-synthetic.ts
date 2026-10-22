/**
 * Synthetic Federal IDR disputes drawn from published 2024 shares.
 *
 * The shares are approximate. They come from CRS Report R48738's reading of the
 * CMS Federal IDR public use files, not from a copied PUF row.
 * https://www.congress.gov/crs-product/R48738
 * CMS report index: https://www.cms.gov/nosurprises/policies-and-resources/Reports
 *
 * Dollar amounts are synthetic. Dispute ids are obvious fakes.
 * The PUF dictionary distinguishes single, bundled, and batched line items.
 * This generator does not apply a batched rate, because a published batched share
 * was not confirmed for the full 2024 file.
 */

import type { DeterminationRequest, Party } from './types';

export const PUF_2024_SHARES = {
  provider_initiated_pct: 99,
  air_ambulance_pct: 3,
  ineligible_pct: 19,
  provider_prevails_among_determinations_pct: 85,
  selected_offer_above_qpa_pct: 85,
  insurer_offer_at_or_below_qpa_pct: 47,
  /**
   * Synthetic mix. With an 85 percent provider win rate and a 47 percent
   * insurer-at-or-below-QPA rate, a 91 percent provider-above-QPA rate keeps
   * the selected-offer share near the published 85 percent.
   */
  provider_offer_above_qpa_pct: 91,
} as const;

export const PUF_GENERATOR_SEED = 2024;
export const PUF_LOAD_COUNT = 5000;

const CV_TEXT = 'Synthetic board certification in a demonstration specialty.';

export interface SyntheticDispute {
  dispute_ref: string;
  case_id: string;
  line_id: string;
  service: 'emergency or nonemergency item' | 'air ambulance service';
  initiating_side: 'provider_or_facility' | 'plan_or_issuer';
  eligibility: 'eligible' | 'ineligible';
  /** Null when the dispute is ineligible and is not a payment determination. */
  prevailing_side: 'provider_or_facility' | 'plan_or_issuer' | null;
  shape: 'single';
  qpa_cents: number;
  provider_offer_cents: number;
  plan_offer_cents: number;
}

export function generateSyntheticDisputes(count = PUF_LOAD_COUNT, seed = PUF_GENERATOR_SEED): SyntheticDispute[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Synthetic dispute count must be a positive integer.');
  }
  const next = mulberry32(seed);
  const disputes: SyntheticDispute[] = [];
  for (let index = 1; index <= count; index += 1) {
    disputes.push(oneDispute(index, next));
  }
  return disputes;
}

export function syntheticDisputeToRequest(dispute: SyntheticDispute): DeterminationRequest {
  const ipIsProvider = dispute.initiating_side === 'provider_or_facility';
  const providerWins = dispute.prevailing_side === 'provider_or_facility';
  const prevailing: Party =
    dispute.eligibility === 'ineligible' ? 'NIP' : ipIsProvider === providerWins ? 'IP' : 'NIP';
  const ipCents = ipIsProvider ? dispute.provider_offer_cents : dispute.plan_offer_cents;
  const nipCents = ipIsProvider ? dispute.plan_offer_cents : dispute.provider_offer_cents;
  const n = dispute.dispute_ref.replace('DISP-SYN-', '');
  return {
    case_id: dispute.case_id,
    dispute_ref: dispute.dispute_ref,
    prevailing_party: prevailing,
    reason: 'The selected offer is the offer recorded for the prevailing party on this dispute.',
    eligibility: dispute.eligibility,
    line_items: [
      {
        line_id: dispute.line_id,
        label: dispute.service,
        ip_offer: { amount: centsToAmount(ipCents), doc_id: `DOC-SYN-${n}-IP`, page: 2 },
        nip_offer: { amount: centsToAmount(nipCents), doc_id: `DOC-SYN-${n}-NIP`, page: 3 },
        qpa: { amount: centsToAmount(dispute.qpa_cents), doc_id: `DOC-SYN-${n}-QPA`, page: 1 },
      },
    ],
    documents: [
      { doc_id: `DOC-SYN-${n}-IP`, role: 'offer_sheet', party: 'IP', label: 'Initiating party offer sheet' },
      { doc_id: `DOC-SYN-${n}-NIP`, role: 'offer_sheet', party: 'NIP', label: 'Non-initiating party offer sheet' },
      { doc_id: `DOC-SYN-${n}-QPA`, role: 'qpa_statement', party: 'NIP', label: 'Qualifying payment amount statement' },
      {
        doc_id: `DOC-SYN-${n}-CV`,
        role: 'cv',
        party: 'IP',
        label: 'Curriculum vitae',
        text: CV_TEXT,
        board_certification: 'board certification',
        specialty: 'demonstration specialty',
      },
    ],
    factor_materials: [],
  };
}

function oneDispute(index: number, next: () => number): SyntheticDispute {
  const serial = String(index).padStart(5, '0');
  const service = percent(next, PUF_2024_SHARES.air_ambulance_pct)
    ? 'air ambulance service'
    : 'emergency or nonemergency item';
  const initiating = percent(next, PUF_2024_SHARES.provider_initiated_pct) ? 'provider_or_facility' : 'plan_or_issuer';
  const ineligible = percent(next, PUF_2024_SHARES.ineligible_pct);
  const providerPrevails = percent(next, PUF_2024_SHARES.provider_prevails_among_determinations_pct);
  const qpa = (100 + Math.floor(next() * 4901)) * 100;
  const providerAbove = percent(next, PUF_2024_SHARES.provider_offer_above_qpa_pct);
  const planAtOrBelow = percent(next, PUF_2024_SHARES.insurer_offer_at_or_below_qpa_pct);
  let provider = offerFromQpa(qpa, providerAbove, next);
  const plan = offerFromQpa(qpa, !planAtOrBelow, next);
  if (provider === plan) provider += 100;
  return {
    dispute_ref: `DISP-SYN-${serial}`,
    case_id: `CASE-SYN-${serial}`,
    line_id: `LI-SYN-${serial}`,
    service,
    initiating_side: initiating,
    eligibility: ineligible ? 'ineligible' : 'eligible',
    prevailing_side: ineligible ? null : providerPrevails ? 'provider_or_facility' : 'plan_or_issuer',
    shape: 'single',
    qpa_cents: qpa,
    provider_offer_cents: provider,
    plan_offer_cents: plan,
  };
}

function offerFromQpa(qpaCents: number, above: boolean, next: () => number): number {
  const pct = above ? 101 + Math.floor(next() * 150) : 50 + Math.floor(next() * 51);
  return Math.max(100, Math.round((qpaCents * pct) / 100));
}

function percent(next: () => number, pct: number): boolean {
  return next() * 100 < pct;
}

function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

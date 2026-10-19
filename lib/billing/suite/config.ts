import type { FinancePolicy, IdrFeeSchedule, MedReviewContractTerms, PayoutSchedule } from './types';

/**
 * PRELIMINARY payout figures. No owner has confirmed reviewer or Medical Director pay.
 * Edit this object. Do not copy the numbers into the pricer.
 */
export const PAYOUT_SCHEDULE_PRELIMINARY: PayoutSchedule = {
  id: 'iro-payout-2026-10-19-preliminary',
  preliminary: true,
  effective_from: '2026-01-01T00:00:00.000Z',
  effective_to: null,
  reviewer_flat_cents: 35_000,
  md_flat_cents: 12_500,
  peer_to_peer_hourly_cents: 22_500,
  spending_limit_cents: 50_000,
  change_note: 'Skeleton payouts for ledger math. Not a rate card. Hourly is peer-to-peer only.',
};

/** Synthetic IDR case fee so the IDR book can be tested. Not a CMS fee. */
export const IDR_FEE_SCHEDULE_PRELIMINARY: IdrFeeSchedule = {
  id: 'idr-fee-synthetic-2026-10-19',
  preliminary: true,
  case_fee_cents: 40_000,
  change_note: 'Synthetic IDR fee. Kept off the IRO book and off escrow.',
};

/**
 * Synthetic Medical Review contract. Not the locked UM price card.
 * The entitlement check is what ties this post to Med Review packaging.
 */
export const MED_REVIEW_CONTRACT_PRELIMINARY: MedReviewContractTerms = {
  id: 'mr-contract-synthetic-2026-10-19',
  preliminary: true,
  platform_cents: 250_000,
  per_review_cents: 9_000,
  change_note: 'Synthetic contract terms. Does not replace lib/billing/um-price-card.ts.',
};

export const FINANCE_POLICY: FinancePolicy = {
  id: 'finance-access-2026-10-19',
  cfo_roles: ['cfo'],
  payout_approver_roles: ['cfo', 'santana'],
};

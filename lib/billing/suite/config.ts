import type { FinancePolicy, IdrFeeSchedule, MedReviewContractTerms, PayoutSchedule } from './types';

/**
 * Shipped payout schedule. Amounts are unconfigured on purpose.
 * Reviewer and Medical Director rates are not in the source docs.
 * Posting this object is a STOP until a supplied schedule fills the amounts.
 */
export const PAYOUT_SCHEDULE_UNCONFIGURED: PayoutSchedule = {
  id: 'iro-payout-unconfigured',
  preliminary: true,
  configured: false,
  test_only: false,
  effective_from: null,
  effective_to: null,
  reviewer_flat_cents: null,
  md_flat_cents: null,
  peer_to_peer_hourly_cents: null,
  spending_limit_cents: null,
  change_note: 'Unconfigured. CFO or Santana supply amounts. Do not invent rates in this file.',
};

const IDR_EMPTY = 'Unconfigured. An IDR amount posts only with a cited source_ref. Uncited config is a STOP.';

/** Administrative IDR fee slot. Empty until a citation is supplied. */
export const IDR_ADMIN_FEE_UNCONFIGURED: IdrFeeSchedule = {
  id: 'idr-admin-fee-unconfigured',
  preliminary: true,
  configured: false,
  test_only: false,
  fee_type: 'administrative',
  effective_from: null,
  effective_to: null,
  amount_cents: null,
  source_ref: null,
  change_note: IDR_EMPTY,
};

/** IDRE fee slot. Separate from the administrative fee. Also empty. */
export const IDR_IDRE_FEE_UNCONFIGURED: IdrFeeSchedule = {
  id: 'idr-idre-fee-unconfigured',
  preliminary: true,
  configured: false,
  test_only: false,
  fee_type: 'idre',
  effective_from: null,
  effective_to: null,
  amount_cents: null,
  source_ref: null,
  change_note: IDR_EMPTY,
};

/**
 * Shipped Medical Review contract. Prices are unconfigured.
 * This does not replace lib/billing/um-price-card.ts.
 */
export const MED_REVIEW_CONTRACT_UNCONFIGURED: MedReviewContractTerms = {
  id: 'mr-contract-unconfigured',
  preliminary: true,
  configured: false,
  test_only: false,
  effective_from: null,
  effective_to: null,
  platform_cents: null,
  per_review_cents: null,
  change_note: 'Unconfigured. No Med Review price is invented here. Posting this contract is a STOP.',
};

export const FINANCE_POLICY: FinancePolicy = {
  id: 'finance-access-2026-10-19',
  cfo_roles: ['cfo'],
  payout_approver_roles: ['cfo', 'santana'],
};

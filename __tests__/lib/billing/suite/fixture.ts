import { OHIO_SETTINGS_V1 } from '@/lib/iro/config/state-settings';
import { IRO_FEE_SCHEDULE_V1 } from '@/lib/iro/config/fee-schedule';
import { quoteFee } from '@/lib/iro/fees';
import {
  FINANCE_POLICY,
  stubAccounting,
  stubBankAch,
  stubPaymentProcessor,
  stubPayroll,
  type FinanceActor,
  type FinanceDeps,
  type FinanceRole,
  type IdrFeeSchedule,
  type MedReviewContractTerms,
  type PayoutSchedule,
} from '@/lib/billing/suite';
import type { LineOfBusiness } from '@/lib/lines';

/**
 * TEST-ONLY amounts. Not a rate card, not a CMS fee, and not a Medical Review price.
 * Production config ships these schedules unconfigured. Do not copy these numbers there.
 */
export const TEST_ONLY_PAYOUT_SCHEDULE: PayoutSchedule = {
  id: 'TEST-ONLY-iro-payout',
  preliminary: true,
  configured: true,
  test_only: true,
  effective_from: '2026-01-01T00:00:00.000Z',
  effective_to: null,
  reviewer_flat_cents: 35_000,
  md_flat_cents: 12_500,
  peer_to_peer_hourly_cents: 22_500,
  spending_limit_cents: 50_000,
  change_note: 'TEST-ONLY. Not a rate card. Not for a production post.',
};

export const TEST_ONLY_IDR_ADMIN_FEE: IdrFeeSchedule = {
  id: 'TEST-ONLY-idr-admin',
  preliminary: true,
  configured: true,
  test_only: true,
  fee_type: 'administrative',
  effective_from: '2026-01-01T00:00:00.000Z',
  effective_to: null,
  amount_cents: 40_000,
  source_ref: 'TEST-ONLY: not a CMS citation',
  change_note: 'TEST-ONLY. Not a CMS or IDRE fee.',
};

export const TEST_ONLY_MED_REVIEW_CONTRACT: MedReviewContractTerms = {
  id: 'TEST-ONLY-mr-contract',
  preliminary: true,
  configured: true,
  test_only: true,
  effective_from: '2026-01-01T00:00:00.000Z',
  effective_to: null,
  platform_cents: 250_000,
  per_review_cents: 9_000,
  change_note: 'TEST-ONLY. Does not replace lib/billing/um-price-card.ts.',
};

export const NOW = '2026-10-19T15:00:00.000Z';
export const DUE = '2026-11-18T15:00:00.000Z';

export function actor(
  id: string,
  lines: readonly LineOfBusiness[],
  finance_role: FinanceRole = 'line_billing',
  approval_role: string | null = null,
): FinanceActor {
  return {
    id,
    finance_role,
    approval_role,
    companies: ['VANTA_HG'],
    lines,
    case_restricted: false,
    assigned_case_ids: [],
    line_wide: finance_role === 'cfo',
  };
}

export function deps(): FinanceDeps & {
  processor: ReturnType<typeof stubPaymentProcessor>;
  bank: ReturnType<typeof stubBankAch>;
  accounting: ReturnType<typeof stubAccounting>;
  payroll: ReturnType<typeof stubPayroll>;
} {
  return {
    now: () => NOW,
    policy: FINANCE_POLICY,
    processor: stubPaymentProcessor(),
    bank: stubBankAch(),
    accounting: stubAccounting(),
    payroll: stubPayroll(),
    firewallAudit: [],
  };
}

export function ohioSpecialistQuote() {
  return quoteFee({
    schedule: IRO_FEE_SCHEDULE_V1,
    settings: OHIO_SETTINGS_V1,
    category: 'medical_necessity',
    expedited: false,
    specialist_count: 1,
    early_closure: false,
    payer: 'client',
  });
}

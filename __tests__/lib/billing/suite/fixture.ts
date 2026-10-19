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
} from '@/lib/billing/suite';
import type { LineOfBusiness } from '@/lib/lines';

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

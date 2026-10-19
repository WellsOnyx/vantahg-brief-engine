import type {
  AccountingSystemAdapter,
  BankAchAdapter,
  PaymentProcessorAdapter,
  ReviewerPayrollAdapter,
} from './types';

function receipt(reference: string) {
  return {
    ok: true as const,
    vendor: null,
    live_call: false as const,
    rail: 'none' as const,
    settled: false as const,
    reference,
  };
}

export function stubPaymentProcessor(): PaymentProcessorAdapter & { calls: number } {
  const state = { calls: 0 };
  return {
    vendor: null,
    live_call: false,
    decision: 'payment_processor',
    get calls() {
      return state.calls;
    },
    authorize(input) {
      state.calls += 1;
      return receipt(`processor:${input.invoice_id}`);
    },
  };
}

export function stubBankAch(): BankAchAdapter & { calls: number } {
  const state = { calls: 0 };
  return {
    vendor: null,
    live_call: false,
    decision: 'bank_ach',
    get calls() {
      return state.calls;
    },
    submit(input) {
      state.calls += 1;
      return receipt(`ach:${input.invoice_id}`);
    },
  };
}

export function stubAccounting(): AccountingSystemAdapter & { calls: number } {
  const state = { calls: 0 };
  return {
    vendor: null,
    live_call: false,
    decision: 'accounting',
    get calls() {
      return state.calls;
    },
    exportJournal(input) {
      state.calls += 1;
      return receipt(`gl:${input.book}:${input.record_id}`);
    },
  };
}

export function stubPayroll(): ReviewerPayrollAdapter & { calls: number } {
  const state = { calls: 0 };
  return {
    vendor: null,
    live_call: false,
    decision: 'reviewer_payroll',
    get calls() {
      return state.calls;
    },
    pushPayout(input) {
      state.calls += 1;
      return receipt(`payroll:${input.payout_id}`);
    },
  };
}

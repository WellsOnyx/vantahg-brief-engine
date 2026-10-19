/**
 * Payment rails are unselected. These interfaces record intent only.
 * None of them move money. Open decisions: processor, bank/ACH, GL, payroll.
 */

export interface AdapterReceipt {
  ok: true;
  vendor: null;
  live_call: false;
  rail: 'none';
  settled: false;
  reference: string;
}

export interface PaymentProcessorAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'payment_processor';
  authorize(input: { invoice_id: string; amount_cents: number }): AdapterReceipt;
}

export interface BankAchAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'bank_ach';
  submit(input: { invoice_id: string; amount_cents: number }): AdapterReceipt;
}

export interface AccountingSystemAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'accounting';
  exportJournal(input: { book: string; amount_cents: number; record_id: string }): AdapterReceipt;
}

export interface ReviewerPayrollAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'reviewer_payroll';
  pushPayout(input: { payout_id: string; amount_cents: number }): AdapterReceipt;
}

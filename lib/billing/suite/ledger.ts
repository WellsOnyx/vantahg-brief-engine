import type { UmBriefEngineEntitlementInput } from '@/lib/entitlements/um-brief-engine';
import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import type { LineOfBusiness } from '@/lib/lines';
import type { FirewallAuditEvent } from '@/lib/lines';
import { quoteIsConfirmable } from '@/lib/iro/fees';
import type { FeeQuote } from '@/lib/iro/types';
import type { AccountingSystemAdapter, BankAchAdapter, PaymentProcessorAdapter, ReviewerPayrollAdapter } from './adapters/types';
import { appendAudit, canApproveSpend, canViewConsolidated, financeGate } from './access';
import { lineOwnsBook, transferAllowed } from './books';
import { pricePayout, type PayoutPriceInput } from './payouts';
import { escrowLiabilityCents, invoiceNetCents, openBalanceCents, paidCents } from './reconciliation';
import type {
  FinanceActor,
  FinanceBook,
  FinanceInvoice,
  FinanceNo,
  FinancePolicy,
  FinanceResult,
  FinanceState,
  IdrFeeSchedule,
  MedReviewContractTerms,
  PayoutSchedule,
} from './types';

export interface FinanceDeps {
  now: () => string;
  policy: FinancePolicy;
  processor: PaymentProcessorAdapter;
  bank: BankAchAdapter;
  accounting: AccountingSystemAdapter;
  payroll: ReviewerPayrollAdapter;
  firewallAudit?: FirewallAuditEvent[];
}

export function emptyFinance(): FinanceState {
  return { invoices: [], payments: [], adjustments: [], escrow: [], closures: [], audit: [] };
}

function fail(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  action: string,
  code: string,
  message: string,
  line: LineOfBusiness | 'ALL',
  book: FinanceBook | null,
  amount: number | null,
  recordId: string | null,
): FinanceNo {
  return {
    ok: false,
    code,
    message,
    state: appendAudit(state, {
      at: deps.now(),
      actor_id: actor.id,
      action,
      code,
      line_of_business: line,
      book,
      amount_cents: amount,
      record_id: recordId,
    }),
  };
}

function guard(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  action: string,
  record: { id: string; case_id: string; line_of_business: LineOfBusiness },
  op: 'read' | 'write' | 'report',
): FinanceNo | null {
  const gate = financeGate(actor, record, op, deps.firewallAudit ?? [], deps.now);
  if (gate.allowed) return null;
  return fail(state, actor, deps, action, gate.code, gate.message, record.line_of_business, null, null, record.id);
}

function pushInvoice(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  invoice: FinanceInvoice,
  action: string,
  exportJournal = true,
): FinanceResult<FinanceInvoice> {
  if (exportJournal) {
    const exported = deps.accounting.exportJournal({
      book: invoice.book,
      amount_cents: invoice.amount_cents,
      record_id: invoice.id,
    });
    if (exported.settled || exported.live_call || exported.vendor !== null) {
      return fail(state, actor, deps, action, 'rail_refused', 'Accounting adapter must not settle a rail.', invoice.line_of_business, invoice.book, invoice.amount_cents, invoice.id);
    }
  }
  const next = appendAudit(
    { ...state, invoices: [...state.invoices, invoice] },
    {
      at: deps.now(),
      actor_id: actor.id,
      action,
      code: 'ok',
      line_of_business: invoice.line_of_business,
      book: invoice.book,
      amount_cents: invoice.amount_cents,
      record_id: invoice.id,
    },
  );
  return { ok: true, state: next, value: invoice };
}

export function postIroCaseFee(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: {
    id: string;
    case_id: string;
    party_ref: string;
    due_at: string;
    quote: FeeQuote;
    case_closed: boolean;
  },
): FinanceResult<FinanceInvoice> {
  const denied = guard(state, actor, deps, 'post_iro_fee', { id: input.id, case_id: input.case_id, line_of_business: 'IRO' }, 'write');
  if (denied) return denied;
  if (!quoteIsConfirmable(input.quote)) {
    return fail(state, actor, deps, 'post_iro_fee', 'quote_not_confirmable', 'Flagged or prohibited IRO charges are not invoiced.', 'IRO', 'iro_operating', input.quote.display_total_cents, input.case_id);
  }
  const invoice: FinanceInvoice = {
    id: input.id,
    company: 'VANTA_HG',
    line_of_business: 'IRO',
    book: 'iro_operating',
    direction: 'AR',
    case_id: input.case_id,
    party_ref: input.party_ref,
    amount_cents: input.quote.billable_total_cents,
    status: 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: input.quote.flags,
    schedule_id: input.quote.schedule_id,
  };
  return pushInvoice(state, actor, deps, invoice, 'post_iro_fee');
}

export function postIroPayout(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: {
    id: string;
    case_id: string;
    party_ref: string;
    due_at: string;
    schedule: PayoutSchedule;
    case_closed: boolean;
  } & PayoutPriceInput,
): FinanceResult<FinanceInvoice> {
  const denied = guard(state, actor, deps, 'post_iro_payout', { id: input.id, case_id: input.case_id, line_of_business: 'IRO' }, 'write');
  if (denied) return denied;
  const priced = pricePayout(input.schedule, input);
  if (!priced.ok) {
    return fail(state, actor, deps, 'post_iro_payout', priced.code, priced.message, 'IRO', 'iro_operating', null, input.case_id);
  }
  const pending = priced.needs_approval;
  const invoice: FinanceInvoice = {
    id: input.id,
    company: 'VANTA_HG',
    line_of_business: 'IRO',
    book: 'iro_operating',
    direction: 'AP',
    case_id: input.case_id,
    party_ref: input.party_ref,
    amount_cents: priced.amount_cents,
    status: pending ? 'pending_approval' : 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: [
      ...(priced.flag ? [priced.flag] : []),
      ...(priced.needs_approval ? ['spending_limit'] : []),
    ],
    schedule_id: input.schedule.id,
  };
  if (!pending) {
    const payroll = deps.payroll.pushPayout({ payout_id: invoice.id, amount_cents: invoice.amount_cents });
    if (payroll.settled || payroll.vendor !== null) {
      return fail(state, actor, deps, 'post_iro_payout', 'rail_refused', 'Payroll adapter must not settle a rail.', 'IRO', 'iro_operating', invoice.amount_cents, invoice.id);
    }
  }
  return pushInvoice(state, actor, deps, invoice, 'post_iro_payout', !pending);
}

export function approvePayout(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  payoutId: string,
): FinanceResult<FinanceInvoice> {
  const invoice = state.invoices.find((row) => row.id === payoutId);
  if (!invoice || invoice.direction !== 'AP') {
    return fail(state, actor, deps, 'approve_payout', 'payout_missing', 'Payout was not found.', 'IRO', 'iro_operating', null, payoutId);
  }
  const denied = guard(state, actor, deps, 'approve_payout', invoice, 'write');
  if (denied) return denied;
  if (!canApproveSpend(actor, deps.policy)) {
    return fail(state, actor, deps, 'approve_payout', 'spending_approval_denied', 'This role cannot approve a payout over the spending limit.', invoice.line_of_business, invoice.book, invoice.amount_cents, invoice.id);
  }
  if (invoice.status !== 'pending_approval') {
    return fail(state, actor, deps, 'approve_payout', 'payout_not_pending', 'Payout is not waiting for approval.', invoice.line_of_business, invoice.book, invoice.amount_cents, invoice.id);
  }
  const payroll = deps.payroll.pushPayout({ payout_id: invoice.id, amount_cents: invoice.amount_cents });
  const exported = deps.accounting.exportJournal({
    book: invoice.book,
    amount_cents: invoice.amount_cents,
    record_id: invoice.id,
  });
  if (payroll.settled || payroll.vendor !== null || exported.settled || exported.vendor !== null) {
    return fail(state, actor, deps, 'approve_payout', 'rail_refused', 'Payroll adapter must not settle a rail.', invoice.line_of_business, invoice.book, invoice.amount_cents, invoice.id);
  }
  const updated: FinanceInvoice = { ...invoice, status: 'open' };
  const nextState: FinanceState = {
    ...state,
    invoices: state.invoices.map((row) => (row.id === invoice.id ? updated : row)),
  };
  return {
    ok: true,
    value: updated,
    state: appendAudit(nextState, {
      at: deps.now(),
      actor_id: actor.id,
      action: 'approve_payout',
      code: 'ok',
      line_of_business: invoice.line_of_business,
      book: invoice.book,
      amount_cents: invoice.amount_cents,
      record_id: invoice.id,
    }),
  };
}

export function postIdrCaseFee(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { id: string; case_id: string; party_ref: string; due_at: string; schedule: IdrFeeSchedule; case_closed: boolean },
): FinanceResult<FinanceInvoice> {
  const denied = guard(state, actor, deps, 'post_idr_fee', { id: input.id, case_id: input.case_id, line_of_business: 'IDR' }, 'write');
  if (denied) return denied;
  const invoice: FinanceInvoice = {
    id: input.id,
    company: 'VANTA_HG',
    line_of_business: 'IDR',
    book: 'idr_fees',
    direction: 'AR',
    case_id: input.case_id,
    party_ref: input.party_ref,
    amount_cents: input.schedule.case_fee_cents,
    status: 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: [],
    schedule_id: input.schedule.id,
  };
  return pushInvoice(state, actor, deps, invoice, 'post_idr_fee');
}

export function postMedReviewContract(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: {
    id: string;
    case_id: string;
    party_ref: string;
    due_at: string;
    contract: MedReviewContractTerms;
    review_count: number;
    entitlement: UmBriefEngineEntitlementInput;
    case_closed: boolean;
  },
): FinanceResult<FinanceInvoice> {
  const denied = guard(state, actor, deps, 'post_med_review', { id: input.id, case_id: input.case_id, line_of_business: 'MEDICAL_REVIEW' }, 'write');
  if (denied) return denied;
  const access = evaluateUmBriefEngineAccess(input.entitlement);
  if (!access.allowed) {
    return fail(state, actor, deps, 'post_med_review', access.code, access.reason, 'MEDICAL_REVIEW', 'med_review', null, input.case_id);
  }
  const amount = input.contract.platform_cents + input.review_count * input.contract.per_review_cents;
  const invoice: FinanceInvoice = {
    id: input.id,
    company: 'VANTA_HG',
    line_of_business: 'MEDICAL_REVIEW',
    book: 'med_review',
    direction: 'AR',
    case_id: input.case_id,
    party_ref: input.party_ref,
    amount_cents: amount,
    status: 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: [],
    schedule_id: input.contract.id,
  };
  return pushInvoice(state, actor, deps, invoice, 'post_med_review');
}

export function depositEscrow(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { id: string; case_id: string; amount_cents: number },
): FinanceResult<FinanceState['escrow'][number]> {
  const denied = guard(state, actor, deps, 'escrow_deposit', { id: input.id, case_id: input.case_id, line_of_business: 'IDR' }, 'write');
  if (denied) return denied;
  if (input.amount_cents <= 0) {
    return fail(state, actor, deps, 'escrow_deposit', 'amount_invalid', 'Escrow deposit must be positive.', 'IDR', 'idr_escrow', input.amount_cents, input.case_id);
  }
  const entry = {
    id: input.id,
    case_id: input.case_id,
    line_of_business: 'IDR' as const,
    book: 'idr_escrow' as const,
    direction: 'deposit' as const,
    amount_cents: input.amount_cents,
    at: deps.now(),
  };
  const next = appendAudit(
    { ...state, escrow: [...state.escrow, entry] },
    {
      at: deps.now(),
      actor_id: actor.id,
      action: 'escrow_deposit',
      code: 'ok',
      line_of_business: 'IDR',
      book: 'idr_escrow',
      amount_cents: input.amount_cents,
      record_id: input.id,
    },
  );
  return { ok: true, state: next, value: entry };
}

export function releaseEscrow(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { id: string; case_id: string; amount_cents: number },
): FinanceResult<FinanceState['escrow'][number]> {
  const denied = guard(state, actor, deps, 'escrow_release', { id: input.id, case_id: input.case_id, line_of_business: 'IDR' }, 'write');
  if (denied) return denied;
  const held = escrowLiabilityCents(state, input.case_id);
  if (input.amount_cents <= 0 || input.amount_cents > held) {
    return fail(state, actor, deps, 'escrow_release', 'escrow_insufficient', 'Release cannot exceed IDR escrow held for this case.', 'IDR', 'idr_escrow', input.amount_cents, input.case_id);
  }
  const entry = {
    id: input.id,
    case_id: input.case_id,
    line_of_business: 'IDR' as const,
    book: 'idr_escrow' as const,
    direction: 'release' as const,
    amount_cents: input.amount_cents,
    at: deps.now(),
  };
  const next = appendAudit(
    { ...state, escrow: [...state.escrow, entry] },
    {
      at: deps.now(),
      actor_id: actor.id,
      action: 'escrow_release',
      code: 'ok',
      line_of_business: 'IDR',
      book: 'idr_escrow',
      amount_cents: input.amount_cents,
      record_id: input.id,
    },
  );
  return { ok: true, state: next, value: entry };
}

/** Escrow cannot pay an IRO, Medical Review, or IDR-fee invoice. */
export function applyEscrowToInvoice(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { invoice_id: string; amount_cents: number },
): FinanceResult<null> {
  const invoice = state.invoices.find((row) => row.id === input.invoice_id);
  const line = invoice?.line_of_business ?? 'IDR';
  return fail(
    state,
    actor,
    deps,
    'apply_escrow',
    'book_separation',
    'IDR escrow cannot settle another book. IRO money and IDR fees stay separate.',
    line,
    'idr_escrow',
    input.amount_cents,
    input.invoice_id,
  );
}

export function moveBetweenBooks(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { from: FinanceBook; to: FinanceBook; amount_cents: number },
): FinanceResult<null> {
  const allowed = transferAllowed(input.from, input.to);
  return fail(
    state,
    actor,
    deps,
    'move_between_books',
    allowed ? 'no_internal_sweep' : 'book_separation',
    allowed
      ? 'Same-book sweeps are not a payment rail.'
      : 'Books cannot fund each other. Escrow stays out of IRO money.',
    'ALL',
    input.from,
    input.amount_cents,
    null,
  );
}

export function recordPayment(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { id: string; invoice_id: string; amount_cents: number },
): FinanceResult<FinanceState['payments'][number]> {
  const invoice = state.invoices.find((row) => row.id === input.invoice_id);
  if (!invoice) {
    return fail(state, actor, deps, 'record_payment', 'invoice_missing', 'Invoice was not found.', 'IRO', null, input.amount_cents, input.invoice_id);
  }
  const denied = guard(state, actor, deps, 'record_payment', invoice, 'write');
  if (denied) return denied;
  if (!lineOwnsBook(invoice.line_of_business, invoice.book) || invoice.book === 'idr_escrow') {
    return fail(state, actor, deps, 'record_payment', 'book_separation', 'This book cannot take a payment.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
  }
  const open = openBalanceCents(state, invoice);
  if (input.amount_cents <= 0 || input.amount_cents > open) {
    return fail(state, actor, deps, 'record_payment', 'amount_invalid', 'Payment must be positive and within the open balance.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
  }
  const processor = deps.processor.authorize({ invoice_id: invoice.id, amount_cents: input.amount_cents });
  const ach = deps.bank.submit({ invoice_id: invoice.id, amount_cents: input.amount_cents });
  if (processor.settled || ach.settled || processor.vendor !== null || ach.vendor !== null || processor.live_call || ach.live_call) {
    return fail(state, actor, deps, 'record_payment', 'rail_refused', 'Payment adapters are not a live rail.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
  }
  const payment = {
    id: input.id,
    invoice_id: invoice.id,
    line_of_business: invoice.line_of_business,
    book: invoice.book,
    amount_cents: input.amount_cents,
    at: deps.now(),
    external_settlement: 'not_configured' as const,
  };
  const remaining = open - input.amount_cents;
  const updated: FinanceInvoice = { ...invoice, status: remaining === 0 ? 'paid' : 'open' };
  const next: FinanceState = {
    ...state,
    invoices: state.invoices.map((row) => (row.id === invoice.id ? updated : row)),
    payments: [...state.payments, payment],
  };
  return {
    ok: true,
    value: payment,
    state: appendAudit(next, {
      at: deps.now(),
      actor_id: actor.id,
      action: 'record_payment',
      code: 'ok',
      line_of_business: invoice.line_of_business,
      book: invoice.book,
      amount_cents: input.amount_cents,
      record_id: payment.id,
    }),
  };
}

export function proposeAdjustment(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { id: string; invoice_id: string; amount_cents: number; reason: string },
): FinanceResult<FinanceState['adjustments'][number]> {
  const invoice = state.invoices.find((row) => row.id === input.invoice_id);
  if (!invoice) {
    return fail(state, actor, deps, 'propose_adjustment', 'invoice_missing', 'Invoice was not found.', 'IRO', null, input.amount_cents, input.invoice_id);
  }
  const denied = guard(state, actor, deps, 'propose_adjustment', invoice, 'write');
  if (denied) return denied;
  const adjustment = {
    id: input.id,
    invoice_id: invoice.id,
    line_of_business: invoice.line_of_business,
    book: invoice.book,
    amount_cents: input.amount_cents,
    reason: input.reason,
    status: 'pending' as const,
    requested_by: actor.id,
    approved_by: null,
    at: deps.now(),
  };
  const next = appendAudit(
    { ...state, adjustments: [...state.adjustments, adjustment] },
    {
      at: deps.now(),
      actor_id: actor.id,
      action: 'propose_adjustment',
      code: 'ok',
      line_of_business: invoice.line_of_business,
      book: invoice.book,
      amount_cents: input.amount_cents,
      record_id: adjustment.id,
    },
  );
  return { ok: true, state: next, value: adjustment };
}

export function approveAdjustment(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  adjustmentId: string,
): FinanceResult<FinanceState['adjustments'][number]> {
  const current = state.adjustments.find((row) => row.id === adjustmentId);
  if (!current) {
    return fail(state, actor, deps, 'approve_adjustment', 'adjustment_missing', 'Adjustment was not found.', 'IRO', null, null, adjustmentId);
  }
  const invoice = state.invoices.find((row) => row.id === current.invoice_id);
  if (!invoice) {
    return fail(state, actor, deps, 'approve_adjustment', 'invoice_missing', 'Invoice was not found.', current.line_of_business, current.book, current.amount_cents, adjustmentId);
  }
  const denied = guard(state, actor, deps, 'approve_adjustment', invoice, 'write');
  if (denied) return denied;
  if (!canApproveSpend(actor, deps.policy) || actor.id === current.requested_by) {
    return fail(state, actor, deps, 'approve_adjustment', 'adjustment_approval_denied', 'Adjustments need a different approver on the configured list.', invoice.line_of_business, invoice.book, current.amount_cents, current.id);
  }
  if (current.status !== 'pending') {
    return fail(state, actor, deps, 'approve_adjustment', 'adjustment_not_pending', 'Adjustment is not pending.', invoice.line_of_business, invoice.book, current.amount_cents, current.id);
  }
  const nextNet = invoiceNetCents(state, invoice) + current.amount_cents;
  if (nextNet < paidCents(state, invoice.id) || nextNet < 0) {
    return fail(state, actor, deps, 'approve_adjustment', 'adjustment_below_zero', 'Adjustment cannot drive the invoice below what is already paid.', invoice.line_of_business, invoice.book, current.amount_cents, current.id);
  }
  const updated = { ...current, status: 'approved' as const, approved_by: actor.id };
  const next = appendAudit(
    {
      ...state,
      adjustments: state.adjustments.map((row) => (row.id === updated.id ? updated : row)),
    },
    {
      at: deps.now(),
      actor_id: actor.id,
      action: 'approve_adjustment',
      code: 'ok',
      line_of_business: invoice.line_of_business,
      book: invoice.book,
      amount_cents: current.amount_cents,
      record_id: current.id,
    },
  );
  return { ok: true, state: next, value: updated };
}

/** Closure is recorded and does not create an invoice or a payout. */
export function noteCaseClosed(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { case_id: string; line: LineOfBusiness },
): FinanceResult<{ posted_invoice: false }> {
  const denied = guard(state, actor, deps, 'note_closure', { id: input.case_id, case_id: input.case_id, line_of_business: input.line }, 'write');
  if (denied) return denied;
  const before = state.invoices.length;
  const next = appendAudit(
    {
      ...state,
      closures: [
        ...state.closures,
        { case_id: input.case_id, line_of_business: input.line, closed_at: deps.now(), posted_invoice: false },
      ],
    },
    {
      at: deps.now(),
      actor_id: actor.id,
      action: 'note_closure',
      code: 'ok',
      line_of_business: input.line,
      book: null,
      amount_cents: null,
      record_id: input.case_id,
    },
  );
  if (next.invoices.length !== before) {
    return fail(state, actor, deps, 'note_closure', 'closure_posted_money', 'Closure must not post money.', input.line, null, null, input.case_id);
  }
  return { ok: true, state: next, value: { posted_invoice: false } };
}

export interface ConsolidatedStatement {
  blended_cash_cents: null;
  lines: {
    IRO: { ar_open_cents: number; ap_open_cents: number };
    IDR: { fee_ar_open_cents: number; escrow_liability_cents: number };
    MEDICAL_REVIEW: { ar_open_cents: number };
  };
}

export function consolidatedStatement(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
): FinanceResult<ConsolidatedStatement> {
  if (!canViewConsolidated(actor, deps.policy)) {
    return fail(state, actor, deps, 'consolidated', 'consolidated_denied', 'Only a CFO role can open the consolidated view.', 'ALL', null, null, null);
  }
  for (const line of ['IDR', 'IRO', 'MEDICAL_REVIEW'] as const) {
    const denied = guard(state, actor, deps, 'consolidated', { id: `consolidated:${line}`, case_id: `consolidated:${line}`, line_of_business: line }, 'report');
    if (denied) return denied;
  }
  const open = (line: LineOfBusiness, direction: 'AR' | 'AP', book: FinanceBook) =>
    state.invoices
      .filter((row) => row.line_of_business === line && row.direction === direction && row.book === book)
      .reduce((sum, row) => sum + openBalanceCents(state, row), 0);
  const value: ConsolidatedStatement = {
    blended_cash_cents: null,
    lines: {
      IRO: { ar_open_cents: open('IRO', 'AR', 'iro_operating'), ap_open_cents: open('IRO', 'AP', 'iro_operating') },
      IDR: { fee_ar_open_cents: open('IDR', 'AR', 'idr_fees'), escrow_liability_cents: escrowLiabilityCents(state) },
      MEDICAL_REVIEW: { ar_open_cents: open('MEDICAL_REVIEW', 'AR', 'med_review') },
    },
  };
  return {
    ok: true,
    value,
    state: appendAudit(state, {
      at: deps.now(),
      actor_id: actor.id,
      action: 'consolidated',
      code: 'ok',
      line_of_business: 'ALL',
      book: null,
      amount_cents: null,
      record_id: null,
    }),
  };
}

export function readInvoice(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  invoiceId: string,
): FinanceResult<FinanceInvoice> {
  const invoice = state.invoices.find((row) => row.id === invoiceId);
  if (!invoice) {
    return fail(state, actor, deps, 'read_invoice', 'invoice_missing', 'Invoice was not found.', 'IRO', null, null, invoiceId);
  }
  const denied = guard(state, actor, deps, 'read_invoice', invoice, 'read');
  if (denied) return denied;
  return { ok: true, state, value: invoice };
}

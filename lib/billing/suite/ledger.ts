import type { UmBriefEngineEntitlementInput } from '@/lib/entitlements/um-brief-engine';
import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import type { LineOfBusiness } from '@/lib/lines';
import type { FirewallAuditEvent } from '@/lib/lines';
import { STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import type { FeeQuote } from '@/lib/iro/types';
import type { AccountingSystemAdapter, BankAchAdapter, PaymentProcessorAdapter, ReviewerPayrollAdapter } from './adapters/types';
import { appendAudit, canApproveSpend, canViewConsolidated, financeGate } from './access';
import { lineOwnsBook, transferAllowed } from './books';
import { pricePayout, type PayoutPriceInput } from './payouts';
import { escrowLiabilityCents, invoiceNetCents, openBalanceCents, paidCents } from './reconciliation';
import type {
  EscrowReleaseType,
  FinanceActor,
  FinanceBook,
  FinanceInvoice,
  FinanceInvoiceLine,
  FinanceNo,
  FinancePolicy,
  FinanceResult,
  FinanceState,
  IdrFeeSchedule,
  InvoiceDirection,
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
  return {
    invoices: [],
    payments: [],
    adjustments: [],
    credits: [],
    escrow: [],
    refunds: [],
    closures: [],
    audit: [],
  };
}

function nextInvoiceNumber(state: FinanceState, line: LineOfBusiness, direction: InvoiceDirection): string {
  const seq = state.invoices.filter((row) => row.line_of_business === line && row.direction === direction).length + 1;
  return `${line}-${direction}-${String(seq).padStart(6, '0')}`;
}

function issuedCents(lines: readonly FinanceInvoiceLine[]): number {
  return lines.filter((line) => line.status === 'issued').reduce((sum, line) => sum + line.amount_cents, 0);
}

function quoteLines(quote: FeeQuote): FinanceInvoiceLine[] {
  return quote.lines.map((line, index) => ({
    line_no: index + 1,
    charge_key: line.code,
    description: line.description,
    amount_cents: line.amount_cents,
    status: line.permitted && line.flag == null ? 'issued' : 'draft',
  }));
}

function withTestOnly(flags: readonly string[], testOnly: boolean): string[] {
  return testOnly && !flags.includes('test_only') ? [...flags, 'test_only'] : [...flags];
}

function stateProhibitsPatientBilling(state: string): boolean {
  return STATE_SETTINGS_REGISTRY.versions.some(
    (row) => row.state === state && row.patient_billing === 'prohibited',
  );
}

/** Uncited, empty, or expired IDR config cannot be invoiced. */
export function idrPostBlock(schedule: IdrFeeSchedule, now: string): { code: string; message: string } | null {
  const source = schedule.source_ref?.trim() ?? '';
  if (!schedule.configured || schedule.amount_cents == null) {
    return {
      code: 'idr_unconfigured',
      message: 'IDR fees are unconfigured. No amount is posted until a cited source is supplied.',
    };
  }
  if (!source) {
    return {
      code: 'idr_source_missing',
      message: 'IDR amounts require a cited source_ref. Uncited config is a STOP.',
    };
  }
  if (schedule.amount_cents <= 0) {
    return { code: 'idr_unconfigured', message: 'An IDR amount must be a positive cited figure.' };
  }
  const expired =
    (schedule.effective_to !== null && schedule.effective_to <= now) ||
    (schedule.effective_from !== null && schedule.effective_from > now);
  if (expired) {
    return {
      code: 'idr_source_expired',
      message: 'This IDR citation is outside its effective dates. Posting stops.',
    };
  }
  return null;
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
  if (state.invoices.some((row) => row.id === invoice.id)) {
    return fail(state, actor, deps, action, 'duplicate_invoice', 'This invoice id was already posted.', invoice.line_of_business, invoice.book, invoice.amount_cents, invoice.id);
  }
  if (issuedCents(invoice.lines) !== invoice.amount_cents) {
    return fail(state, actor, deps, action, 'invoice_lines_mismatch', 'Issued invoice lines must sum to the invoice amount.', invoice.line_of_business, invoice.book, invoice.amount_cents, invoice.id);
  }
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
    payer: 'client' | 'carrier' | 'patient';
    state: string;
    case_closed: boolean;
  },
): FinanceResult<FinanceInvoice> {
  const denied = guard(state, actor, deps, 'post_iro_fee', { id: input.id, case_id: input.case_id, line_of_business: 'IRO' }, 'write');
  if (denied) return denied;
  if (input.quote.patient_billing_blocked || (input.payer === 'patient' && stateProhibitsPatientBilling(input.state))) {
    return fail(state, actor, deps, 'post_iro_fee', 'patient_billing_prohibited', 'This state prohibits billing the patient. The quote is not invoiced.', 'IRO', 'iro_operating', input.quote.display_total_cents, input.case_id);
  }
  if (input.quote.exceeds_cap) {
    return fail(state, actor, deps, 'post_iro_fee', 'quote_not_confirmable', 'The quote exceeds the state cap and is not invoiced.', 'IRO', 'iro_operating', input.quote.display_total_cents, input.case_id);
  }
  const lines = quoteLines(input.quote);
  const amount = issuedCents(lines);
  if (amount <= 0 || amount !== input.quote.billable_total_cents) {
    return fail(state, actor, deps, 'post_iro_fee', 'quote_not_confirmable', 'Issued IRO lines do not match the billable total.', 'IRO', 'iro_operating', input.quote.billable_total_cents, input.case_id);
  }
  const invoice: FinanceInvoice = {
    id: input.id,
    invoice_number: nextInvoiceNumber(state, 'IRO', 'AR'),
    company: 'VANTA_HG',
    line_of_business: 'IRO',
    book: 'iro_operating',
    direction: 'AR',
    case_id: input.case_id,
    party_ref: input.party_ref,
    lines,
    fee_type: null,
    amount_cents: amount,
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
    invoice_number: nextInvoiceNumber(state, 'IRO', 'AP'),
    company: 'VANTA_HG',
    line_of_business: 'IRO',
    book: 'iro_operating',
    direction: 'AP',
    case_id: input.case_id,
    party_ref: input.party_ref,
    lines: [
      {
        line_no: 1,
        charge_key: input.role,
        description: input.peer_to_peer ? 'peer_to_peer' : input.role,
        amount_cents: priced.amount_cents,
        status: 'issued',
      },
    ],
    fee_type: null,
    amount_cents: priced.amount_cents,
    status: pending ? 'pending_approval' : 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: withTestOnly(
      [
        ...(priced.flag ? [priced.flag] : []),
        ...(priced.needs_approval ? ['spending_limit'] : []),
      ],
      input.schedule.test_only,
    ),
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
  const blocked = idrPostBlock(input.schedule, deps.now());
  if (blocked) {
    return fail(state, actor, deps, 'post_idr_fee', blocked.code, blocked.message, 'IDR', 'idr_fees', input.schedule.amount_cents, input.case_id);
  }
  const amount = input.schedule.amount_cents ?? 0;
  const invoice: FinanceInvoice = {
    id: input.id,
    invoice_number: nextInvoiceNumber(state, 'IDR', 'AR'),
    company: 'VANTA_HG',
    line_of_business: 'IDR',
    book: 'idr_fees',
    direction: 'AR',
    case_id: input.case_id,
    party_ref: input.party_ref,
    lines: [
      {
        line_no: 1,
        charge_key: input.schedule.fee_type,
        description: input.schedule.fee_type === 'idre' ? 'IDRE fee' : 'IDR administrative fee',
        amount_cents: amount,
        status: 'issued',
      },
    ],
    fee_type: input.schedule.fee_type,
    amount_cents: amount,
    status: 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: withTestOnly([], input.schedule.test_only),
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
  const platform = input.contract.platform_cents;
  const perReview = input.contract.per_review_cents;
  if (!input.contract.configured || platform == null || perReview == null || input.review_count < 0) {
    return fail(state, actor, deps, 'post_med_review', 'med_review_unconfigured', 'Medical Review contract prices are unconfigured. Nothing is posted.', 'MEDICAL_REVIEW', 'med_review', null, input.case_id);
  }
  const reviewCents = input.review_count * perReview;
  const lines: FinanceInvoiceLine[] = [
    { line_no: 1, charge_key: 'platform', description: 'Medical Review platform', amount_cents: platform, status: 'issued' },
  ];
  if (input.review_count > 0) {
    lines.push({
      line_no: 2,
      charge_key: 'per_review',
      description: 'Medical Review per review',
      amount_cents: reviewCents,
      status: 'issued',
    });
  }
  const amount = platform + reviewCents;
  const invoice: FinanceInvoice = {
    id: input.id,
    invoice_number: nextInvoiceNumber(state, 'MEDICAL_REVIEW', 'AR'),
    company: 'VANTA_HG',
    line_of_business: 'MEDICAL_REVIEW',
    book: 'med_review',
    direction: 'AR',
    case_id: input.case_id,
    party_ref: input.party_ref,
    lines,
    fee_type: null,
    amount_cents: amount,
    status: 'open',
    issued_at: deps.now(),
    due_at: input.due_at,
    case_closed_at_billing: input.case_closed,
    flags: withTestOnly([], input.contract.test_only),
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
    release_type: null,
    source_ref: null,
    approved_by: null,
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
  input: {
    id: string;
    case_id: string;
    amount_cents: number;
    release_type: EscrowReleaseType;
    source_ref?: string | null;
  },
): FinanceResult<FinanceState['escrow'][number]> {
  const denied = guard(state, actor, deps, 'escrow_release', { id: input.id, case_id: input.case_id, line_of_business: 'IDR' }, 'write');
  if (denied) return denied;
  if (input.release_type === 'earned_fee') {
    return fail(
      state,
      actor,
      deps,
      'escrow_release',
      'earned_fee_stop',
      'Earned-fee release into an operating book stays stopped until a cited source is activated. No money moved.',
      'IDR',
      'idr_escrow',
      input.amount_cents,
      input.case_id,
    );
  }
  if (!canApproveSpend(actor, deps.policy)) {
    return fail(state, actor, deps, 'escrow_release', 'escrow_approval_denied', 'Escrow release needs a configured approver.', 'IDR', 'idr_escrow', input.amount_cents, input.case_id);
  }
  const source = input.source_ref?.trim() ?? '';
  if (input.release_type === 'refund' && !source) {
    return fail(state, actor, deps, 'escrow_release', 'escrow_source_missing', 'A refund needs a source_ref and stays on the escrow book.', 'IDR', 'idr_escrow', input.amount_cents, input.case_id);
  }
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
    release_type: input.release_type,
    source_ref: source || null,
    approved_by: actor.id,
    amount_cents: input.amount_cents,
    at: deps.now(),
  };
  const refunds = input.release_type === 'refund'
    ? [
        ...state.refunds,
        {
          id: `refund-${input.id}`,
          escrow_entry_id: input.id,
          case_id: input.case_id,
          line_of_business: 'IDR' as const,
          book: 'idr_escrow' as const,
          amount_cents: input.amount_cents,
          source_ref: source,
          approved_by: actor.id,
          at: deps.now(),
        },
      ]
    : state.refunds;
  const next = appendAudit(
    { ...state, escrow: [...state.escrow, entry], refunds },
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
  if (state.payments.some((row) => row.id === input.id)) {
    return fail(state, actor, deps, 'record_payment', 'duplicate_payment', 'This payment id was already recorded.', invoice.line_of_business, invoice.book, input.amount_cents, input.id);
  }
  if (!lineOwnsBook(invoice.line_of_business, invoice.book) || invoice.book === 'idr_escrow') {
    return fail(state, actor, deps, 'record_payment', 'book_separation', 'This book cannot take a payment.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
  }
  if (invoice.status === 'void' || invoice.status === 'pending_approval') {
    return fail(state, actor, deps, 'record_payment', 'invoice_not_payable', 'This invoice cannot take a payment.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
  }
  const open = openBalanceCents(state, invoice);
  if (input.amount_cents <= 0) {
    return fail(state, actor, deps, 'record_payment', 'amount_invalid', 'Payment must be positive.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
  }
  const applied = Math.min(input.amount_cents, Math.max(open, 0));
  const excess = input.amount_cents - applied;
  if (applied > 0) {
    const processor = deps.processor.authorize({ invoice_id: invoice.id, amount_cents: applied });
    const ach = deps.bank.submit({ invoice_id: invoice.id, amount_cents: applied });
    if (processor.settled || ach.settled || processor.vendor !== null || ach.vendor !== null || processor.live_call || ach.live_call) {
      return fail(state, actor, deps, 'record_payment', 'rail_refused', 'Payment adapters are not a live rail.', invoice.line_of_business, invoice.book, input.amount_cents, invoice.id);
    }
  }
  const payment = {
    id: input.id,
    invoice_id: invoice.id,
    line_of_business: invoice.line_of_business,
    book: invoice.book,
    amount_cents: applied,
    credit_cents: excess,
    at: deps.now(),
    external_settlement: 'not_configured' as const,
  };
  const credits = excess > 0
    ? [
        ...state.credits,
        {
          id: `credit-${input.id}`,
          line_of_business: invoice.line_of_business,
          book: invoice.book,
          party_ref: invoice.party_ref,
          amount_cents: excess,
          source_payment_id: input.id,
          source_invoice_id: invoice.id,
        },
      ]
    : state.credits;
  const remaining = open - applied;
  const updated: FinanceInvoice = { ...invoice, status: remaining === 0 ? 'paid' : 'open' };
  const next: FinanceState = {
    ...state,
    invoices: state.invoices.map((row) => (row.id === invoice.id ? updated : row)),
    payments: [...state.payments, payment],
    credits,
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

/** Apply a line-scoped credit to one invoice on that same line and book. Never automatic. */
export function applyCredit(
  state: FinanceState,
  actor: FinanceActor,
  deps: FinanceDeps,
  input: { id: string; credit_id: string; invoice_id: string; amount_cents: number },
): FinanceResult<FinanceState['payments'][number]> {
  const credit = state.credits.find((row) => row.id === input.credit_id);
  if (!credit) {
    return fail(state, actor, deps, 'apply_credit', 'credit_missing', 'Credit was not found.', 'IRO', null, input.amount_cents, input.credit_id);
  }
  const invoice = state.invoices.find((row) => row.id === input.invoice_id);
  if (!invoice) {
    return fail(state, actor, deps, 'apply_credit', 'invoice_missing', 'Invoice was not found.', credit.line_of_business, credit.book, input.amount_cents, input.invoice_id);
  }
  const denied = guard(state, actor, deps, 'apply_credit', invoice, 'write');
  if (denied) return denied;
  if (credit.line_of_business !== invoice.line_of_business || credit.book !== invoice.book) {
    return fail(state, actor, deps, 'apply_credit', 'book_separation', 'A credit stays on its line and book. It is not applied across lines.', credit.line_of_business, credit.book, input.amount_cents, credit.id);
  }
  if (credit.party_ref !== invoice.party_ref) {
    return fail(state, actor, deps, 'apply_credit', 'credit_party_mismatch', 'A credit applies only to the same party on this line.', invoice.line_of_business, invoice.book, input.amount_cents, credit.id);
  }
  const open = openBalanceCents(state, invoice);
  if (input.amount_cents <= 0 || input.amount_cents > credit.amount_cents || input.amount_cents > open) {
    return fail(state, actor, deps, 'apply_credit', 'amount_invalid', 'Credit application must be within the credit and the open balance.', invoice.line_of_business, invoice.book, input.amount_cents, credit.id);
  }
  const payment = {
    id: input.id,
    invoice_id: invoice.id,
    line_of_business: invoice.line_of_business,
    book: invoice.book,
    amount_cents: input.amount_cents,
    credit_cents: 0,
    at: deps.now(),
    external_settlement: 'not_configured' as const,
  };
  const remainingCredit = credit.amount_cents - input.amount_cents;
  const remaining = open - input.amount_cents;
  const updated: FinanceInvoice = { ...invoice, status: remaining === 0 ? 'paid' : 'open' };
  const next: FinanceState = {
    ...state,
    invoices: state.invoices.map((row) => (row.id === invoice.id ? updated : row)),
    payments: [...state.payments, payment],
    credits: state.credits.map((row) => (row.id === credit.id ? { ...row, amount_cents: remainingCredit } : row)),
  };
  return {
    ok: true,
    value: payment,
    state: appendAudit(next, {
      at: deps.now(),
      actor_id: actor.id,
      action: 'apply_credit',
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

import type { FirewallAuditEvent, LineOfBusiness } from '@/lib/lines';
import { appendAudit, canViewConsolidated, financeGate } from './access';
import { booksForLine } from './books';
import type { AgingBucket, FinanceActor, FinanceInvoice, FinanceNo, FinancePolicy, FinanceResult, FinanceState } from './types';

export interface ReportDeps {
  now: () => string;
  policy: FinancePolicy;
  firewallAudit?: FirewallAuditEvent[];
}

function denyReport(
  state: FinanceState,
  actor: FinanceActor,
  deps: ReportDeps,
  action: string,
  line: LineOfBusiness,
  code: string,
  message: string,
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
      book: null,
      amount_cents: null,
      record_id: null,
    }),
  };
}

/** CFO role plus line report access. A line biller cannot open these views. */
function requireCfoReport(
  state: FinanceState,
  actor: FinanceActor,
  deps: ReportDeps,
  action: string,
  line: LineOfBusiness,
): FinanceNo | null {
  if (!canViewConsolidated(actor, deps.policy)) {
    return denyReport(
      state,
      actor,
      deps,
      action,
      line,
      'cfo_required',
      'Reconciliation and aging are CFO views.',
    );
  }
  const gate = financeGate(
    actor,
    { id: `${action}:${line}`, case_id: `${action}:${line}`, line_of_business: line },
    'report',
    deps.firewallAudit ?? [],
    deps.now,
  );
  if (gate.allowed) return null;
  return denyReport(state, actor, deps, action, line, gate.code, gate.message);
}

const DAY_MS = 86_400_000;

export function invoiceAdjustmentCents(state: FinanceState, invoiceId: string): number {
  return state.adjustments
    .filter((row) => row.invoice_id === invoiceId && row.status === 'approved')
    .reduce((sum, row) => sum + row.amount_cents, 0);
}

export function paidCents(state: FinanceState, invoiceId: string): number {
  return state.payments
    .filter((row) => row.invoice_id === invoiceId)
    .reduce((sum, row) => sum + row.amount_cents, 0);
}

export function invoiceNetCents(state: FinanceState, invoice: FinanceInvoice): number {
  return invoice.amount_cents + invoiceAdjustmentCents(state, invoice.id);
}

export function openBalanceCents(state: FinanceState, invoice: FinanceInvoice): number {
  if (invoice.status === 'void' || invoice.status === 'pending_approval') return 0;
  return invoiceNetCents(state, invoice) - paidCents(state, invoice.id);
}

export function daysPastDue(dueAt: string, asOf: string): number {
  return Math.floor((Date.parse(asOf) - Date.parse(dueAt)) / DAY_MS);
}

export function agingBucket(dueAt: string, asOf: string): AgingBucket {
  const days = daysPastDue(dueAt, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return '1_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return 'over_90';
}

export function ageOpenItems(
  state: FinanceState,
  actor: FinanceActor,
  deps: ReportDeps,
  line: LineOfBusiness,
  direction: 'AR' | 'AP',
  asOf: string,
): FinanceResult<Record<AgingBucket, number>> {
  const denied = requireCfoReport(state, actor, deps, 'age_open_items', line);
  if (denied) return denied;
  const buckets: Record<AgingBucket, number> = {
    current: 0,
    '1_30': 0,
    '31_60': 0,
    '61_90': 0,
    over_90: 0,
  };
  const books = new Set(booksForLine(line));
  for (const invoice of state.invoices) {
    if (invoice.line_of_business !== line || invoice.direction !== direction) continue;
    if (!books.has(invoice.book) || invoice.book === 'idr_escrow') continue;
    const open = openBalanceCents(state, invoice);
    if (open <= 0) continue;
    buckets[agingBucket(invoice.due_at, asOf)] += open;
  }
  return {
    ok: true,
    value: buckets,
    state: appendAudit(state, {
      at: deps.now(),
      actor_id: actor.id,
      action: 'age_open_items',
      code: 'ok',
      line_of_business: line,
      book: null,
      amount_cents: null,
      record_id: null,
    }),
  };
}

export function escrowLiabilityCents(state: FinanceState, caseId?: string): number {
  return state.escrow.reduce((sum, entry) => {
    if (caseId && entry.case_id !== caseId) return sum;
    return sum + (entry.direction === 'deposit' ? entry.amount_cents : -entry.amount_cents);
  }, 0);
}

export interface CompletedCaseMoney {
  case_id: string;
  expected_fee_cents: number;
  expected_payout_cents: number;
}

export interface LineReconciliation {
  line: LineOfBusiness;
  expected_fee_cents: number;
  invoiced_fee_cents: number;
  fee_variance_cents: number;
  missing_fee_case_ids: string[];
  invoiced_before_completion: string[];
  expected_payout_cents: number;
  recorded_payout_cents: number;
  payout_variance_cents: number;
  missing_payout_case_ids: string[];
  /** Escrow is reported and then left out of both variances. */
  escrow_liability_cents: number;
  escrow_in_variance: false;
}

/**
 * CFO check: invoices vs completed cases, in integer cents.
 * A case that is invoiced before it is closed is listed, not treated as a fee match.
 * Escrow liability is not added to fee or payout variance.
 */
export function reconcileLine(
  state: FinanceState,
  actor: FinanceActor,
  deps: ReportDeps,
  line: LineOfBusiness,
  completed: readonly CompletedCaseMoney[],
): FinanceResult<LineReconciliation> {
  const denied = requireCfoReport(state, actor, deps, 'reconcile_line', line);
  if (denied) return denied;
  const books = new Set(booksForLine(line));
  const completedIds = new Set(completed.map((row) => row.case_id));
  const ar = state.invoices.filter(
    (row) =>
      row.line_of_business === line &&
      row.direction === 'AR' &&
      row.status !== 'void' &&
      row.status !== 'pending_approval' &&
      books.has(row.book) &&
      row.book !== 'idr_escrow',
  );
  const ap = state.invoices.filter(
    (row) =>
      row.line_of_business === line &&
      row.direction === 'AP' &&
      row.status !== 'void' &&
      row.status !== 'pending_approval' &&
      books.has(row.book),
  );

  const feeFor = (caseId: string) =>
    ar.filter((row) => row.case_id === caseId).reduce((sum, row) => sum + invoiceNetCents(state, row), 0);
  const payFor = (caseId: string) =>
    ap.filter((row) => row.case_id === caseId).reduce((sum, row) => sum + invoiceNetCents(state, row), 0);

  const expectedFee = completed.reduce((sum, row) => sum + row.expected_fee_cents, 0);
  const invoicedFee = completed.reduce((sum, row) => sum + feeFor(row.case_id), 0);
  const expectedPayout = completed.reduce((sum, row) => sum + row.expected_payout_cents, 0);
  const recordedPayout = completed.reduce((sum, row) => sum + payFor(row.case_id), 0);

  const value: LineReconciliation = {
    line,
    expected_fee_cents: expectedFee,
    invoiced_fee_cents: invoicedFee,
    fee_variance_cents: invoicedFee - expectedFee,
    missing_fee_case_ids: completed.filter((row) => feeFor(row.case_id) === 0).map((row) => row.case_id),
    invoiced_before_completion: ar.filter((row) => !completedIds.has(row.case_id)).map((row) => row.id),
    expected_payout_cents: expectedPayout,
    recorded_payout_cents: recordedPayout,
    payout_variance_cents: recordedPayout - expectedPayout,
    missing_payout_case_ids: completed.filter((row) => payFor(row.case_id) === 0 && row.expected_payout_cents > 0).map((row) => row.case_id),
    escrow_liability_cents: line === 'IDR' ? escrowLiabilityCents(state) : 0,
    escrow_in_variance: false,
  };
  return {
    ok: true,
    value,
    state: appendAudit(state, {
      at: deps.now(),
      actor_id: actor.id,
      action: 'reconcile_line',
      code: 'ok',
      line_of_business: line,
      book: null,
      amount_cents: null,
      record_id: null,
    }),
  };
}

/**
 * Two-line invoice: platform PMPM × lives-in-month + one review tier per case.
 * Rules/auto posts at $0. Highest touch is one line, not a stack of fees.
 */

import { randomUUID } from 'crypto';
import { requireCriteriaCogs } from './criteria-cogs';
import {
  mintBillableEvent,
  type BillableEvent,
  type BillableEventLedger,
} from './events';
import { assertNoAutoReviewFee, assertNoGoldCardReviewFee } from './um-guards';
import {
  resolvePlatformPmpm,
  reviewCharge,
  roundCents,
  UM_DENOMINATORS,
  UM_PRICE_CARD,
  type ReviewRoute,
} from './um-price-card';

export interface UmInvoiceCase {
  case_id: string;
  bill_tier: ReviewRoute | null;
  charge_amount: number | null;
  cost_amount: number | null;
  excluded: boolean;
  /** R19. When true the review line must be $0. It still posts. */
  gold_card?: boolean;
}

export interface UmInvoiceReviewLine {
  case_id: string;
  tier: ReviewRoute;
  quantity: 1;
  unit_price: number;
  cost_amount: number;
  amount: number;
}

export interface TwoLineInvoice {
  client_id: string;
  period_start: string;
  period_end: string;
  platform: {
    lives_in_month: number;
    pmpm: number;
    amount: number;
    waived: boolean;
  };
  reviews: UmInvoiceReviewLine[];
  review_amount: number;
  total: number;
  variable_cogs: number;
  contribution: number;
  /** Null until the caller passes an employee count. Never an unlabeled PEPM. */
  pepm: number | null;
  pmpm: number | null;
  denominator_label: string;
}

export function buildTwoLineInvoice(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  livesInMonth: number;
  employeesInMonth?: number | null;
  platformPmpm?: number;
  platformWaived?: boolean;
  cases: readonly UmInvoiceCase[];
}): TwoLineInvoice {
  if (!Number.isFinite(input.livesInMonth) || input.livesInMonth < 0) {
    throw new Error('lives-in-month must be a non-negative number');
  }
  const pmpm = resolvePlatformPmpm({
    pmpm: input.platformPmpm,
    waived: input.platformWaived,
  });
  const platformAmount = roundCents(input.livesInMonth * pmpm);
  const reviews: UmInvoiceReviewLine[] = [];

  for (const row of input.cases) {
    if (row.excluded || !row.bill_tier) continue;
    const quote = requireCriteriaCogs(row.bill_tier);
    const unit = row.charge_amount ?? reviewCharge(row.bill_tier, 0);
    assertNoAutoReviewFee(row.bill_tier, unit);
    assertNoGoldCardReviewFee(row.gold_card === true, unit);
    const cost = row.cost_amount ?? quote.fully_loaded_cost;
    reviews.push({
      case_id: row.case_id,
      tier: row.bill_tier,
      quantity: 1,
      unit_price: unit,
      cost_amount: cost,
      amount: unit,
    });
  }

  const reviewAmount = roundCents(reviews.reduce((sum, line) => sum + line.amount, 0));
  const variableCogs = roundCents(reviews.reduce((sum, line) => sum + line.cost_amount, 0));
  const total = roundCents(platformAmount + reviewAmount);
  const employees = input.employeesInMonth ?? null;
  const pepm = employees && employees > 0 ? roundCents(total / employees) : null;
  const pmpmBilled = input.livesInMonth > 0 ? roundCents(total / input.livesInMonth) : null;

  return {
    client_id: input.clientId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    platform: {
      lives_in_month: input.livesInMonth,
      pmpm,
      amount: platformAmount,
      waived: Boolean(input.platformWaived),
    },
    reviews,
    review_amount: reviewAmount,
    total,
    variable_cogs: variableCogs,
    contribution: roundCents(total - variableCogs),
    pepm,
    pmpm: pmpmBilled,
    denominator_label:
      employees && employees > 0
        ? `PEPM uses ${employees} employees; PMPM uses ${input.livesInMonth} lives`
        : `PMPM uses ${input.livesInMonth} lives; PEPM omitted (no employee count)`,
  };
}

const LEGACY_SKUS = new Set(['prior_auth', 'first_level_appeal', 'rush_addon']);

/**
 * When a case has a two-line review row, drop the legacy synthetic SKU
 * rows for that case so a statement does not bill both schedules.
 */
export function selectCommercialLedgerRows(events: readonly BillableEvent[]): BillableEvent[] {
  const umCases = new Set(
    events.filter((event) => event.sku === 'um_review').map((event) => event.case_id),
  );
  return events.filter((event) => {
    if (LEGACY_SKUS.has(event.sku) && umCases.has(event.case_id)) return false;
    return true;
  });
}

export async function upsertUmReviewLine(
  ledger: BillableEventLedger,
  input: {
    caseId: string;
    clientId: string;
    tier: ReviewRoute;
    charge: number;
    cost: number;
    touchStack: readonly string[];
    occurredAt: string;
  },
): Promise<BillableEvent> {
  assertNoAutoReviewFee(input.tier, input.charge);
  requireCriteriaCogs(input.tier);
  const existing = (await ledger.getByCase(input.caseId)).filter(
    (event) => event.sku === 'um_review' && event.status !== 'void',
  );
  if (existing.length > 1) {
    throw new Error(`case ${input.caseId} has more than one open UM review line`);
  }
  const current = existing[0];
  if (current) {
    const next: BillableEvent = {
      ...current,
      unit_price: input.charge,
      bill_tier: input.tier,
      cost_amount: input.cost,
      touch_stack: [...input.touchStack],
      line_kind: 'um_review',
    };
    return ledger.update(next);
  }
  return ledger.insert({
    ...mintBillableEvent({
      case_id: input.caseId,
      client_id: input.clientId,
      sku: 'prior_auth',
      unit_price: input.charge,
      occurred_at: input.occurredAt,
    }),
    sku: 'um_review',
    line_kind: 'um_review',
    bill_tier: input.tier,
    cost_amount: input.cost,
    touch_stack: [...input.touchStack],
  });
}

export async function upsertPlatformLine(
  ledger: BillableEventLedger,
  input: {
    clientId: string;
    periodKey: string;
    livesInMonth: number;
    pmpm: number;
    occurredAt: string;
  },
): Promise<BillableEvent> {
  if (input.pmpm !== 0 && input.pmpm !== UM_PRICE_CARD.platform.defaultPmpm) {
    resolvePlatformPmpm({ pmpm: input.pmpm });
  }
  const caseId = `platform:${input.clientId}:${input.periodKey}`;
  const amount = roundCents(input.livesInMonth * input.pmpm);
  const existing = (await ledger.getByCase(caseId)).filter(
    (event) => event.sku === 'um_platform' && event.status !== 'void',
  );
  if (existing[0]) {
    return ledger.update({
      ...existing[0],
      unit_price: amount,
      quantity: 1,
      bill_tier: 'platform',
      line_kind: 'um_platform',
      cost_amount: 0,
    });
  }
  return ledger.insert({
    ...mintBillableEvent({
      billable_event_id: randomUUID(),
      case_id: caseId,
      client_id: input.clientId,
      sku: 'prior_auth',
      unit_price: amount,
      occurred_at: input.occurredAt,
    }),
    sku: 'um_platform',
    line_kind: 'um_platform',
    bill_tier: 'platform',
    cost_amount: 0,
    touch_stack: [],
  });
}

export function planningDenominatorLabel(): string {
  return `PEPM ${UM_DENOMINATORS.employees} EE / PMPM ${UM_DENOMINATORS.lives} lives`;
}

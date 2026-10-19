import { describe, expect, it } from 'vitest';
import {
  PAYOUT_SCHEDULE_PRELIMINARY,
  ageOpenItems,
  emptyFinance,
  postIroCaseFee,
  postIroPayout,
  reconcileLine,
} from '@/lib/billing/suite';
import type { FeeQuote } from '@/lib/iro/types';
import { actor, deps, DUE, NOW, ohioSpecialistQuote } from './fixture';

function quoteFor(cents: number): FeeQuote {
  const base = ohioSpecialistQuote();
  return {
    ...base,
    display_total_cents: cents,
    billable_total_cents: cents,
    billable: true,
    flags: [],
    lines: base.lines.map((line) => ({ ...line, permitted: true, flag: null })),
  };
}

describe('CFO reconciliation', () => {
  it('matches completed-case fees and payouts in cents and leaves early invoices aside', () => {
    const rails = deps();
    const biller = actor('biller', ['IRO']);
    let state = emptyFinance();
    const first = postIroCaseFee(state, biller, rails, {
      id: 'inv-a',
      case_id: 'case-a',
      party_ref: 'SYN-PLAN',
      due_at: DUE,
      quote: quoteFor(170_000),
      case_closed: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    const second = postIroCaseFee(state, biller, rails, {
      id: 'inv-b',
      case_id: 'case-b',
      party_ref: 'SYN-PLAN',
      due_at: DUE,
      quote: quoteFor(100_000),
      case_closed: true,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    state = second.state;
    const early = postIroCaseFee(state, biller, rails, {
      id: 'inv-open',
      case_id: 'case-open',
      party_ref: 'SYN-PLAN',
      due_at: DUE,
      quote: quoteFor(50_000),
      case_closed: false,
    });
    expect(early.ok).toBe(true);
    if (!early.ok) return;
    state = early.state;
    const payout = postIroPayout(state, biller, rails, {
      id: 'ap-a',
      case_id: 'case-a',
      party_ref: 'syn-reviewer-1',
      due_at: DUE,
      schedule: PAYOUT_SCHEDULE_PRELIMINARY,
      case_closed: true,
      role: 'reviewer',
      peer_to_peer: false,
    });
    expect(payout.ok).toBe(true);
    if (!payout.ok) return;
    state = payout.state;

    const report = reconcileLine(state, 'IRO', [
      { case_id: 'case-a', expected_fee_cents: 170_000, expected_payout_cents: 35_000 },
      { case_id: 'case-b', expected_fee_cents: 100_000, expected_payout_cents: 35_000 },
      { case_id: 'case-c', expected_fee_cents: 130_000, expected_payout_cents: 12_500 },
    ]);
    expect(report.expected_fee_cents).toBe(400_000);
    expect(report.invoiced_fee_cents).toBe(270_000);
    expect(report.fee_variance_cents).toBe(-130_000);
    expect(report.missing_fee_case_ids).toEqual(['case-c']);
    expect(report.invoiced_before_completion).toEqual(['inv-open']);
    expect(report.expected_payout_cents).toBe(82_500);
    expect(report.recorded_payout_cents).toBe(35_000);
    expect(report.payout_variance_cents).toBe(-47_500);
    expect(report.missing_payout_case_ids).toEqual(['case-b', 'case-c']);
    expect(report.escrow_liability_cents).toBe(0);
    expect(report.escrow_in_variance).toBe(false);
    expect(report.fee_variance_cents + report.escrow_liability_cents).toBe(report.fee_variance_cents);
  });

  it('ages open receivables from the due date', () => {
    const posted = postIroCaseFee(emptyFinance(), actor('biller', ['IRO']), deps(), {
      id: 'inv-old',
      case_id: 'case-old',
      party_ref: 'SYN-PLAN',
      due_at: '2026-01-01T00:00:00.000Z',
      quote: quoteFor(80_000),
      case_closed: true,
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const current = postIroCaseFee(posted.state, actor('biller', ['IRO']), deps(), {
      id: 'inv-new',
      case_id: 'case-new',
      party_ref: 'SYN-PLAN',
      due_at: '2026-12-01T00:00:00.000Z',
      quote: quoteFor(20_000),
      case_closed: false,
    });
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    const buckets = ageOpenItems(current.state, 'IRO', 'AR', NOW);
    expect(buckets.over_90).toBe(80_000);
    expect(buckets.current).toBe(20_000);
    expect(buckets['1_30'] + buckets['31_60'] + buckets['61_90']).toBe(0);
  });
});

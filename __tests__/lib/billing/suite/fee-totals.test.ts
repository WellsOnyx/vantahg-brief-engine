import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAYOUT_SCHEDULE_PRELIMINARY,
  approvePayout,
  emptyFinance,
  invoiceNetCents,
  noteCaseClosed,
  openBalanceCents,
  postIroCaseFee,
  postIroPayout,
  pricePayout,
  proposeAdjustment,
  approveAdjustment,
} from '@/lib/billing/suite';
import { actor, deps, DUE, ohioSpecialistQuote } from './fixture';

describe('financial suite fee totals', () => {
  it('invoices the IRO quote total, including the specialist add-on, without closing the case', () => {
    const quote = ohioSpecialistQuote();
    expect(quote.display_total_cents).toBe(170_000);
    expect(quote.display_total).toBe('$1,700.00');
    const posted = postIroCaseFee(emptyFinance(), actor('biller', ['IRO']), deps(), {
      id: 'inv-iro-1',
      case_id: 'iro-syn-oh-0001',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote,
      case_closed: false,
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    expect(posted.value.amount_cents).toBe(170_000);
    expect(posted.value.book).toBe('iro_operating');
    expect(posted.value.case_closed_at_billing).toBe(false);
    const closed = noteCaseClosed(posted.state, actor('biller', ['IRO']), deps(), {
      case_id: 'iro-syn-oh-0001',
      line: 'IRO',
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.value.posted_invoice).toBe(false);
    expect(closed.state.invoices).toHaveLength(1);
    expect(closed.state.closures[0].posted_invoice).toBe(false);
  });

  it('pays flat reviewer and MD amounts and flags hourly peer-to-peer over the spending limit', () => {
    const schedule = PAYOUT_SCHEDULE_PRELIMINARY;
    const reviewer = pricePayout(schedule, { role: 'reviewer', peer_to_peer: false });
    const md = pricePayout(schedule, { role: 'medical_director', peer_to_peer: false });
    expect(reviewer.ok && md.ok).toBe(true);
    if (!reviewer.ok || !md.ok) return;
    expect(reviewer.amount_cents + md.amount_cents).toBe(47_500);
    expect(pricePayout(schedule, { role: 'reviewer', peer_to_peer: false, hours: 2 }).ok).toBe(false);

    const hourly = pricePayout(schedule, { role: 'reviewer', peer_to_peer: true, hours: 3 });
    expect(hourly.ok).toBe(true);
    if (!hourly.ok) return;
    expect(hourly.amount_cents).toBe(67_500);
    expect(hourly.flag).toBe('peer_to_peer_exception');
    expect(hourly.needs_approval).toBe(true);

    const alt = pricePayout(
      { ...schedule, reviewer_flat_cents: 10, md_flat_cents: 20, id: 'alt' },
      { role: 'reviewer', peer_to_peer: false },
    );
    expect(alt.ok && alt.amount_cents).toBe(10);

    let state = emptyFinance();
    const rails = deps();
    const first = postIroPayout(state, actor('biller', ['IRO']), rails, {
      id: 'ap-rev',
      case_id: 'iro-syn-oh-0001',
      party_ref: 'syn-reviewer-1',
      due_at: DUE,
      schedule,
      case_closed: false,
      role: 'reviewer',
      peer_to_peer: false,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    const held = postIroPayout(state, actor('biller', ['IRO']), rails, {
      id: 'ap-p2p',
      case_id: 'iro-syn-oh-0001',
      party_ref: 'syn-reviewer-1',
      due_at: DUE,
      schedule,
      case_closed: false,
      role: 'reviewer',
      peer_to_peer: true,
      hours: 3,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.value.status).toBe('pending_approval');
    expect(held.value.flags).toContain('peer_to_peer_exception');
    expect(openBalanceCents(held.state, held.value)).toBe(0);
    const denied = approvePayout(held.state, actor('biller', ['IRO']), rails, 'ap-p2p');
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.code).toBe('spending_approval_denied');
    const approved = approvePayout(denied.state, actor('cfo', ['IRO', 'IDR', 'MEDICAL_REVIEW'], 'cfo', 'cfo'), rails, 'ap-p2p');
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.status).toBe('open');
    expect(openBalanceCents(approved.state, approved.value)).toBe(67_500);
    expect(rails.payroll.vendor).toBeNull();
    expect(rails.payroll.live_call).toBe(false);
  });

  it('keeps a pending adjustment out of the balance until a different approver accepts it', () => {
    const posted = postIroCaseFee(emptyFinance(), actor('biller', ['IRO']), deps(), {
      id: 'inv-iro-2',
      case_id: 'iro-syn-oh-0002',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote: ohioSpecialistQuote(),
      case_closed: false,
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const proposed = proposeAdjustment(posted.state, actor('biller', ['IRO']), deps(), {
      id: 'adj-1',
      invoice_id: 'inv-iro-2',
      amount_cents: -5_000,
      reason: 'synthetic credit',
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(invoiceNetCents(proposed.state, proposed.state.invoices[0])).toBe(170_000);
    const self = approveAdjustment(proposed.state, actor('biller', ['IRO'], 'line_billing', 'santana'), deps(), 'adj-1');
    expect(self.ok).toBe(false);
    const approved = approveAdjustment(
      proposed.state,
      actor('approver', ['IRO'], 'line_billing', 'santana'),
      deps(),
      'adj-1',
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(invoiceNetCents(approved.state, approved.state.invoices[0])).toBe(165_000);
  });

  it('does not embed payout or fee amounts in the pricer', () => {
    const source = readFileSync('lib/billing/suite/payouts.ts', 'utf8');
    expect(source).not.toMatch(/35_000|12_500|22_500|50_000|170_000/);
    const ledger = readFileSync('lib/billing/suite/ledger.ts', 'utf8');
    expect(ledger).not.toMatch(/35_000|12_500|170_000|100_000/);
  });
});

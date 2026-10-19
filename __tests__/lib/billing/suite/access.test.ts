import { describe, expect, it, vi } from 'vitest';
import {
  MED_REVIEW_CONTRACT_UNCONFIGURED,
  applyCredit,
  consolidatedStatement,
  depositEscrow,
  emptyFinance,
  postIroCaseFee,
  postMedReviewContract,
  readInvoice,
  recordPayment,
} from '@/lib/billing/suite';
import { actor, deps, DUE, ohioSpecialistQuote, TEST_ONLY_MED_REVIEW_CONTRACT } from './fixture';

describe('line-scoped financial access', () => {
  it('denies an IRO biller the IDR book and reserves the consolidated view for a CFO', () => {
    const rails = deps();
    const posted = postIroCaseFee(emptyFinance(), actor('iro', ['IRO']), rails, {
      id: 'inv-iro',
      case_id: 'iro-syn-oh-0001',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote: ohioSpecialistQuote(),
      payer: 'client',
      state: 'OH',
      case_closed: false,
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const held = depositEscrow(posted.state, actor('idr', ['IDR']), rails, {
      id: 'escrow-1',
      case_id: 'idr-syn-0001',
      amount_cents: 500_000,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;

    const cross = readInvoice(held.state, actor('iro', ['IRO']), rails, 'missing');
    expect(cross.ok).toBe(false);

    const idrInvoiceAttempt = postIroCaseFee(held.state, actor('idr', ['IDR']), rails, {
      id: 'inv-blocked',
      case_id: 'iro-syn-oh-0009',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote: ohioSpecialistQuote(),
      payer: 'client',
      state: 'OH',
      case_closed: false,
    });
    expect(idrInvoiceAttempt.ok).toBe(false);
    if (idrInvoiceAttempt.ok) return;
    expect(idrInvoiceAttempt.code).toBe('cross_line');
    expect(idrInvoiceAttempt.state.audit.some((row) => row.code === 'cross_line')).toBe(true);

    const broad = actor('broad', ['IDR', 'IRO', 'MEDICAL_REVIEW']);
    const denied = consolidatedStatement(idrInvoiceAttempt.state, broad, rails);
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.code).toBe('consolidated_denied');

    const cfo = actor('cfo', ['IDR', 'IRO', 'MEDICAL_REVIEW'], 'cfo', 'cfo');
    const view = consolidatedStatement(denied.state, cfo, rails);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.blended_cash_cents).toBeNull();
    expect(view.value.lines.IRO.ar_open_cents).toBe(170_000);
    expect(view.value.lines.IDR.escrow_liability_cents).toBe(500_000);
    expect(view.value.lines.IRO.ar_open_cents + view.value.lines.IDR.escrow_liability_cents).not.toBe(
      view.value.lines.IRO.ar_open_cents,
    );
    expect(JSON.stringify(view.value)).not.toContain('patient');
  });

  it('blocks Medical Review contract billing when the entitlement fails', () => {
    const blocked = postMedReviewContract(emptyFinance(), actor('mr', ['MEDICAL_REVIEW']), deps(), {
      id: 'inv-mr',
      case_id: 'mr-syn-0001',
      party_ref: 'SYN-TPA',
      due_at: DUE,
      contract: MED_REVIEW_CONTRACT_UNCONFIGURED,
      review_count: 2,
      entitlement: { vanta_med_review_contract: true, med_review_provider: 'third_party' },
      case_closed: false,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe('third_party_med_review');
    expect(blocked.state.invoices).toHaveLength(0);

    const posted = postMedReviewContract(blocked.state, actor('mr', ['MEDICAL_REVIEW']), deps(), {
      id: 'inv-mr',
      case_id: 'mr-syn-0001',
      party_ref: 'SYN-TPA',
      due_at: DUE,
      contract: TEST_ONLY_MED_REVIEW_CONTRACT,
      review_count: 2,
      entitlement: { vanta_med_review_contract: true, med_review_provider: 'vanta' },
      case_closed: true,
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    expect(posted.value.book).toBe('med_review');
    expect(posted.value.flags).toContain('test_only');
    expect(posted.value.lines.map((line) => line.charge_key)).toEqual(['platform', 'per_review']);
    expect(posted.value.amount_cents).toBe(268_000);

    const bare = postMedReviewContract(posted.state, actor('mr', ['MEDICAL_REVIEW']), deps(), {
      id: 'inv-mr-empty',
      case_id: 'mr-syn-0002',
      party_ref: 'SYN-TPA',
      due_at: DUE,
      contract: MED_REVIEW_CONTRACT_UNCONFIGURED,
      review_count: 2,
      entitlement: { vanta_med_review_contract: true, med_review_provider: 'vanta' },
      case_closed: false,
    });
    expect(bare.ok).toBe(false);
    if (bare.ok) return;
    expect(bare.code).toBe('med_review_unconfigured');
    expect(bare.state.invoices).toHaveLength(1);
  });

  it('records a payment on the ledger without calling a live rail', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const rails = deps();
    const posted = postIroCaseFee(emptyFinance(), actor('iro', ['IRO']), rails, {
      id: 'inv-pay',
      case_id: 'iro-syn-oh-0001',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote: ohioSpecialistQuote(),
      payer: 'client',
      state: 'OH',
      case_closed: false,
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const paid = recordPayment(posted.state, actor('iro', ['IRO']), rails, {
      id: 'pay-1',
      invoice_id: 'inv-pay',
      amount_cents: 170_000,
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.value.external_settlement).toBe('not_configured');
    expect(paid.state.invoices[0].status).toBe('paid');
    expect(rails.processor.calls).toBe(1);
    expect(rails.processor.vendor).toBeNull();
    expect(rails.bank.calls).toBe(1);
    expect(rails.bank.settled).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const over = recordPayment(paid.state, actor('iro', ['IRO']), rails, {
      id: 'pay-over',
      invoice_id: 'inv-pay',
      amount_cents: 5_000,
    });
    expect(over.ok).toBe(true);
    if (!over.ok) return;
    expect(over.value.amount_cents).toBe(0);
    expect(over.value.credit_cents).toBe(5_000);
    expect(over.state.credits).toHaveLength(1);
    expect(over.state.credits[0].line_of_business).toBe('IRO');
    expect(over.state.credits[0].book).toBe('iro_operating');

    const second = postIroCaseFee(over.state, actor('iro', ['IRO']), rails, {
      id: 'inv-pay-2',
      case_id: 'iro-syn-oh-0002',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote: ohioSpecialistQuote(),
      payer: 'client',
      state: 'OH',
      case_closed: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.credits[0].amount_cents).toBe(5_000);
    const otherLine = postMedReviewContract(second.state, actor('mr', ['MEDICAL_REVIEW']), rails, {
      id: 'inv-mr-credit',
      case_id: 'mr-syn-0003',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      contract: TEST_ONLY_MED_REVIEW_CONTRACT,
      review_count: 0,
      entitlement: { vanta_med_review_contract: true, med_review_provider: 'vanta' },
      case_closed: false,
    });
    expect(otherLine.ok).toBe(true);
    if (!otherLine.ok) return;
    const crossed = applyCredit(otherLine.state, actor('cfo', ['IRO', 'IDR', 'MEDICAL_REVIEW'], 'cfo', 'cfo'), rails, {
      id: 'pay-cross',
      credit_id: over.state.credits[0].id,
      invoice_id: 'inv-mr-credit',
      amount_cents: 5_000,
    });
    expect(crossed.ok).toBe(false);
    if (crossed.ok) return;
    expect(crossed.code).toBe('book_separation');
    expect(crossed.state.credits[0].amount_cents).toBe(5_000);

    const applied = applyCredit(crossed.state, actor('iro', ['IRO']), rails, {
      id: 'pay-credit',
      credit_id: over.state.credits[0].id,
      invoice_id: 'inv-pay-2',
      amount_cents: 5_000,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.credits[0].amount_cents).toBe(0);
    expect(applied.state.invoices.find((row) => row.id === 'inv-pay-2')?.amount_cents).toBe(170_000);
    expect(rails.processor.calls).toBe(1);
  });
});

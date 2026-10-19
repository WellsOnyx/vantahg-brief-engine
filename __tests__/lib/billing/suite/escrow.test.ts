import { describe, expect, it } from 'vitest';
import {
  IDR_ADMIN_FEE_UNCONFIGURED,
  IDR_IDRE_FEE_UNCONFIGURED,
  applyEscrowToInvoice,
  depositEscrow,
  emptyFinance,
  escrowLiabilityCents,
  moveBetweenBooks,
  postIdrCaseFee,
  postIroCaseFee,
  releaseEscrow,
} from '@/lib/billing/suite';
import { actor, deps, DUE, ohioSpecialistQuote, TEST_ONLY_IDR_ADMIN_FEE } from './fixture';

describe('IDR escrow separation', () => {
  it('refuses to use escrow or an IDR fee to pay IRO', () => {
    const iroActor = actor('iro-biller', ['IRO']);
    const idrActor = actor('idr-biller', ['IDR']);
    const rails = deps();
    const fee = postIroCaseFee(emptyFinance(), iroActor, rails, {
      id: 'inv-iro',
      case_id: 'iro-syn-oh-0001',
      party_ref: 'SYN-PLAN-OH',
      due_at: DUE,
      quote: ohioSpecialistQuote(),
      payer: 'client',
      state: 'OH',
      case_closed: false,
    });
    expect(fee.ok).toBe(true);
    if (!fee.ok) return;
    const held = depositEscrow(fee.state, idrActor, rails, {
      id: 'escrow-1',
      case_id: 'idr-syn-0001',
      amount_cents: 1_000_000,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(escrowLiabilityCents(held.state)).toBe(1_000_000);
    expect(held.state.invoices.filter((row) => row.book === 'iro_operating')).toHaveLength(1);

    const applied = applyEscrowToInvoice(held.state, idrActor, rails, {
      invoice_id: 'inv-iro',
      amount_cents: 170_000,
    });
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.code).toBe('book_separation');
    expect(applied.state.payments).toHaveLength(0);
    expect(escrowLiabilityCents(applied.state)).toBe(1_000_000);

    const swept = moveBetweenBooks(applied.state, idrActor, rails, {
      from: 'idr_escrow',
      to: 'iro_operating',
      amount_cents: 1_000_000,
    });
    expect(swept.ok).toBe(false);
    if (swept.ok) return;
    expect(swept.code).toBe('book_separation');

    const unconfigured = postIdrCaseFee(swept.state, idrActor, rails, {
      id: 'inv-idr-empty',
      case_id: 'idr-syn-0001',
      party_ref: 'SYN-IDR-PLAN',
      due_at: DUE,
      schedule: IDR_ADMIN_FEE_UNCONFIGURED,
      case_closed: false,
    });
    expect(unconfigured.ok).toBe(false);
    if (unconfigured.ok) return;
    expect(unconfigured.code).toBe('idr_unconfigured');
    expect(IDR_IDRE_FEE_UNCONFIGURED.fee_type).toBe('idre');
    expect(IDR_ADMIN_FEE_UNCONFIGURED.fee_type).toBe('administrative');
    expect(IDR_IDRE_FEE_UNCONFIGURED.amount_cents).toBeNull();
    expect(IDR_IDRE_FEE_UNCONFIGURED.source_ref).toBeNull();

    const uncited = postIdrCaseFee(unconfigured.state, idrActor, rails, {
      id: 'inv-idr-uncited',
      case_id: 'idr-syn-0001',
      party_ref: 'SYN-IDR-PLAN',
      due_at: DUE,
      schedule: { ...TEST_ONLY_IDR_ADMIN_FEE, source_ref: '  ', id: 'idr-no-source' },
      case_closed: false,
    });
    expect(uncited.ok).toBe(false);
    if (uncited.ok) return;
    expect(uncited.code).toBe('idr_source_missing');

    const expired = postIdrCaseFee(uncited.state, idrActor, rails, {
      id: 'inv-idr-expired',
      case_id: 'idr-syn-0001',
      party_ref: 'SYN-IDR-PLAN',
      due_at: DUE,
      schedule: { ...TEST_ONLY_IDR_ADMIN_FEE, effective_to: '2026-01-02T00:00:00.000Z', id: 'idr-expired' },
      case_closed: false,
    });
    expect(expired.ok).toBe(false);
    if (expired.ok) return;
    expect(expired.code).toBe('idr_source_expired');
    expect(expired.state.invoices.some((row) => row.book === 'idr_fees')).toBe(false);

    const idrFee = postIdrCaseFee(expired.state, idrActor, rails, {
      id: 'inv-idr',
      case_id: 'idr-syn-0001',
      party_ref: 'SYN-IDR-PLAN',
      due_at: DUE,
      schedule: TEST_ONLY_IDR_ADMIN_FEE,
      case_closed: false,
    });
    expect(idrFee.ok).toBe(true);
    if (!idrFee.ok) return;
    expect(idrFee.value.book).toBe('idr_fees');
    expect(idrFee.value.fee_type).toBe('administrative');
    expect(idrFee.value.flags).toContain('test_only');
    expect(idrFee.value.invoice_number).toBe('IDR-AR-000001');
    expect(idrFee.value.amount_cents).toBe(TEST_ONLY_IDR_ADMIN_FEE.amount_cents);
    const feeToIro = applyEscrowToInvoice(idrFee.state, idrActor, rails, {
      invoice_id: 'inv-idr',
      amount_cents: 40_000,
    });
    expect(feeToIro.ok).toBe(false);
    if (!feeToIro.ok) expect(feeToIro.code).toBe('book_separation');

    const earned = releaseEscrow(idrFee.state, actor('idr-approver', ['IDR'], 'line_billing', 'santana'), rails, {
      id: 'escrow-earned',
      case_id: 'idr-syn-0001',
      amount_cents: 1_000_000,
      release_type: 'earned_fee',
      source_ref: 'TEST-ONLY: not a CMS citation',
    });
    expect(earned.ok).toBe(false);
    if (earned.ok) return;
    expect(earned.code).toBe('earned_fee_stop');
    expect(escrowLiabilityCents(earned.state)).toBe(1_000_000);

    const released = releaseEscrow(earned.state, actor('idr-approver', ['IDR'], 'line_billing', 'santana'), rails, {
      id: 'escrow-rel',
      case_id: 'idr-syn-0001',
      amount_cents: 1_000_000,
      release_type: 'party_payment',
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(escrowLiabilityCents(released.state)).toBe(0);
    expect(released.state.invoices.find((row) => row.id === 'inv-iro')?.status).toBe('open');
  });
});

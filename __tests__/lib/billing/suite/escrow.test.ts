import { describe, expect, it } from 'vitest';
import {
  IDR_FEE_SCHEDULE_PRELIMINARY,
  applyEscrowToInvoice,
  depositEscrow,
  emptyFinance,
  escrowLiabilityCents,
  moveBetweenBooks,
  postIdrCaseFee,
  postIroCaseFee,
  releaseEscrow,
} from '@/lib/billing/suite';
import { actor, deps, DUE, ohioSpecialistQuote } from './fixture';

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

    const idrFee = postIdrCaseFee(swept.state, idrActor, rails, {
      id: 'inv-idr',
      case_id: 'idr-syn-0001',
      party_ref: 'SYN-IDR-PLAN',
      due_at: DUE,
      schedule: IDR_FEE_SCHEDULE_PRELIMINARY,
      case_closed: false,
    });
    expect(idrFee.ok).toBe(true);
    if (!idrFee.ok) return;
    expect(idrFee.value.book).toBe('idr_fees');
    expect(idrFee.value.amount_cents).toBe(IDR_FEE_SCHEDULE_PRELIMINARY.case_fee_cents);
    const feeToIro = applyEscrowToInvoice(idrFee.state, idrActor, rails, {
      invoice_id: 'inv-idr',
      amount_cents: 40_000,
    });
    expect(feeToIro.ok).toBe(false);
    if (!feeToIro.ok) expect(feeToIro.code).toBe('book_separation');

    const released = releaseEscrow(idrFee.state, idrActor, rails, {
      id: 'escrow-rel',
      case_id: 'idr-syn-0001',
      amount_cents: 1_000_000,
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(escrowLiabilityCents(released.state)).toBe(0);
    expect(released.state.invoices.find((row) => row.id === 'inv-iro')?.status).toBe('open');
  });
});

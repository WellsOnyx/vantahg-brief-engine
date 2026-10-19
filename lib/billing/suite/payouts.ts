import type { PayoutSchedule } from './types';

export interface PayoutPriceInput {
  role: 'reviewer' | 'medical_director';
  /** Set only for a peer-to-peer exception. Any hours on a flat review is refused. */
  hours?: number | null;
  peer_to_peer: boolean;
}

export type PayoutPrice =
  | { ok: true; amount_cents: number; flag: 'peer_to_peer_exception' | null; needs_approval: boolean }
  | { ok: false; code: 'hourly_not_permitted' | 'hours_required'; message: string };

/** Flat reviewer and Medical Director pay. Hourly exists only as a flagged peer-to-peer exception. */
export function pricePayout(schedule: PayoutSchedule, input: PayoutPriceInput): PayoutPrice {
  if (input.peer_to_peer) {
    if (input.hours == null || input.hours <= 0) {
      return { ok: false, code: 'hours_required', message: 'Peer-to-peer hourly pay needs hours.' };
    }
    const amount = Math.round(input.hours * schedule.peer_to_peer_hourly_cents);
    return {
      ok: true,
      amount_cents: amount,
      flag: 'peer_to_peer_exception',
      needs_approval: amount > schedule.spending_limit_cents,
    };
  }
  if (input.hours != null && input.hours !== 0) {
    return {
      ok: false,
      code: 'hourly_not_permitted',
      message: 'Hourly pay is only the flagged peer-to-peer exception.',
    };
  }
  const amount = input.role === 'reviewer' ? schedule.reviewer_flat_cents : schedule.md_flat_cents;
  return {
    ok: true,
    amount_cents: amount,
    flag: null,
    needs_approval: amount > schedule.spending_limit_cents,
  };
}

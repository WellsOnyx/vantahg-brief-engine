import type { PayoutSchedule } from './types';

export interface PayoutPriceInput {
  role: 'reviewer' | 'medical_director';
  /** Set only for a peer-to-peer exception. Any hours on a flat review is refused. */
  hours?: number | null;
  peer_to_peer: boolean;
}

export type PayoutPrice =
  | { ok: true; amount_cents: number; flag: 'peer_to_peer_exception' | null; needs_approval: boolean }
  | { ok: false; code: 'hourly_not_permitted' | 'hours_required' | 'payout_unconfigured'; message: string };

function unconfigured(): PayoutPrice {
  return {
    ok: false,
    code: 'payout_unconfigured',
    message: 'Payout schedule is unconfigured. No reviewer or Medical Director amount is posted.',
  };
}

function amountOrStop(cents: number | null): number | null {
  if (cents == null || cents < 0) return null;
  return cents;
}

/** Flat reviewer and Medical Director pay. Hourly exists only as a flagged peer-to-peer exception. */
export function pricePayout(schedule: PayoutSchedule, input: PayoutPriceInput): PayoutPrice {
  if (!schedule.configured) return unconfigured();
  const limit = amountOrStop(schedule.spending_limit_cents);
  if (limit == null) return unconfigured();

  if (input.peer_to_peer) {
    if (input.hours == null || input.hours <= 0) {
      return { ok: false, code: 'hours_required', message: 'Peer-to-peer hourly pay needs hours.' };
    }
    const hourly = amountOrStop(schedule.peer_to_peer_hourly_cents);
    if (hourly == null) return unconfigured();
    const amount = Math.round(input.hours * hourly);
    return {
      ok: true,
      amount_cents: amount,
      flag: 'peer_to_peer_exception',
      needs_approval: amount > limit,
    };
  }
  if (input.hours != null && input.hours !== 0) {
    return {
      ok: false,
      code: 'hourly_not_permitted',
      message: 'Hourly pay is only the flagged peer-to-peer exception.',
    };
  }
  const flat = amountOrStop(input.role === 'reviewer' ? schedule.reviewer_flat_cents : schedule.md_flat_cents);
  if (flat == null) return unconfigured();
  return {
    ok: true,
    amount_cents: flat,
    flag: null,
    needs_approval: flat > limit,
  };
}

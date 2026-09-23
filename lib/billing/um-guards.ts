/**
 * Product guards from the 2026-09-23 pricing lock.
 *
 * R2 — no review fee on rules/auto. Charge stays $0. Callers cannot override it.
 * R9 — AI cannot deny medical necessity without a clinician.
 * R19 — no review fee on a gold-carded provider. Charge stays $0.
 *
 * Pricing R2/R9/R19 are not auth-workflow R02/R09/R19.
 */

import type { ReviewRoute } from './um-price-card';

export class UmProductGuardError extends Error {
  constructor(
    readonly code: 'r2_auto_review_fee' | 'r9_ai_deny_mn' | 'r19_gold_card_review_fee',
    message: string,
  ) {
    super(message);
    this.name = 'UmProductGuardError';
  }
}

/** R2. A rules/auto tier cannot carry a review fee. */
export function assertNoAutoReviewFee(route: ReviewRoute, chargeAmount: number): void {
  if (route === 'auto' && chargeAmount !== 0) {
    throw new UmProductGuardError(
      'r2_auto_review_fee',
      'R2: rules/auto review fee is $0 and cannot be overridden',
    );
  }
}

/** R19. A gold-carded provider has no review fee. The row still posts at $0. */
export function assertNoGoldCardReviewFee(goldCard: boolean, chargeAmount: number): void {
  if (goldCard && chargeAmount !== 0) {
    throw new UmProductGuardError(
      'r19_gold_card_review_fee',
      'R19: gold-carded providers have no review fee',
    );
  }
}

/**
 * Reject a client-supplied charge. Prices come from the price card.
 * A supplied charge on rules/auto is always R2, including an explicit $0.
 */
export function assertNoChargeOverride(input: {
  route: ReviewRoute;
  suppliedCharge: number | null | undefined;
}): void {
  if (input.suppliedCharge == null) return;
  if (input.route === 'auto') {
    assertNoAutoReviewFee('auto', input.suppliedCharge === 0 ? 1 : input.suppliedCharge);
  }
  throw new Error('review charge comes from the price card and cannot be overridden on the request');
}

/**
 * R9. AI may not deny medical necessity. A clinician has to sign that deny.
 * Other deny reason codes are not this rule.
 */
export function assertAiCannotDenyMedicalNecessity(input: {
  actorKind: 'ai' | 'clinician';
  determination: string;
  denyReason: string | null;
}): void {
  if (
    input.actorKind === 'ai' &&
    input.determination === 'deny' &&
    input.denyReason === 'medical_necessity'
  ) {
    throw new UmProductGuardError(
      'r9_ai_deny_mn',
      'R9: AI cannot deny medical necessity without a clinician',
    );
  }
}

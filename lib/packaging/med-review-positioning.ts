/**
 * Customer-facing packaging sentences for the Oct 19, 2026 Med Review pivot.
 *
 * The sold product is Vanta Med Review. The Brief Engine is the shared engine
 * under IDR, IRO, and Medical Review. It is not a product line.
 *
 * Entitlement field names and denial codes stay in lib/entitlements/um-brief-engine.ts.
 * This module does not enforce a line firewall. That lands in the parallel IRO slice.
 */

export const MED_REVIEW_PAID_DOOR = 'Vanta Med Review';

export const BRIEF_ENGINE_INCLUDED =
  'The Brief Engine is included only under a paid Vanta Med Review contract.';

export const NOT_STANDALONE_UM =
  'The Brief Engine is not a standalone UM product, and it is not included when another shop performs the review.';

export const SHARED_ENGINE =
  'The Brief Engine is the shared engine under IDR, IRO, and Medical Review. It is not a product line.';

/** Avoid repeating the retired 2026-09-21 platform sentence as current truth. */
export const PLATFORM_SUPERSESSION =
  'The 2026-09-21 platform sentence that limited VantaHG to IRO and IDR is superseded. Vanta HG runs three firewalled lines: IDR, IRO, and Medical Review. A Med Review contract does not open IRO or IDR.';

export const STANDALONE_UM_DENIAL_REASON =
  'The Brief Engine is not offered as a standalone UM product. It is included only under a paid Vanta Med Review contract.';

export const THIRD_PARTY_DENIAL_REASON =
  'The Brief Engine is not included when med review is performed by another shop. Vanta Med Review is the paid contract.';

export const MISSING_CONTRACT_DENIAL_REASON =
  'Brief Engine access requires client_config.vanta_med_review_contract=true (a paid Vanta Med Review contract).';

export const GRANTED_REASON =
  'Paid Vanta Med Review contract: the Brief Engine is included under that contract only.';

export const PUBLISHED_CONFIG_REQUIRED_REASON =
  'Brief Engine access requires a published client_config with vanta_med_review_contract=true.';

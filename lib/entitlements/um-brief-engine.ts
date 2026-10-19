/**
 * Packaging gate (offer locked 2026-09-21; platform sentence superseded 2026-10-19).
 *
 * Vanta Med Review is the paid product. The Brief Engine is included only
 * under that contract. No standalone UM product. No engine with another shop.
 * A Med Review contract does not open IRO or IDR.
 *
 * Field names and denial codes are stable. Canonical:
 * docs/customer-ready/01-product-boundary.md
 */

import {
  GRANTED_REASON,
  MISSING_CONTRACT_DENIAL_REASON,
  STANDALONE_UM_DENIAL_REASON,
  THIRD_PARTY_DENIAL_REASON,
} from '@/lib/packaging/med-review-positioning';

export const VANTA_MED_REVIEW_CONTRACT_FIELD = 'vanta_med_review_contract' as const;

export const MED_REVIEW_PROVIDERS = ['vanta', 'third_party', 'none'] as const;
export type MedReviewProvider = (typeof MED_REVIEW_PROVIDERS)[number];

export const UM_BRIEF_ENGINE_DENIALS = [
  'missing_vanta_med_review_contract',
  'standalone_um_not_offered',
  'third_party_med_review',
] as const;
export type UmBriefEngineDenial = (typeof UM_BRIEF_ENGINE_DENIALS)[number];

export interface UmBriefEngineEntitlementInput {
  /** Required true for Brief Engine access under a paid Med Review contract. */
  vanta_med_review_contract?: boolean | null;
  /**
   * Who performs med review. `third_party` never gets the engine, even if
   * someone mistakenly flips the contract flag.
   */
  med_review_provider?: MedReviewProvider | string | null;
}

export interface UmBriefEngineAccessGranted {
  allowed: true;
  code: 'granted';
  reason: string;
}

export interface UmBriefEngineAccessDenied {
  allowed: false;
  code: UmBriefEngineDenial;
  reason: string;
}

export type UmBriefEngineAccess = UmBriefEngineAccessGranted | UmBriefEngineAccessDenied;

export class UmBriefEngineEntitlementError extends Error {
  readonly code = 'um_brief_engine_not_entitled' as const;
  constructor(
    readonly denial: UmBriefEngineDenial,
    message: string,
    readonly client_id?: string,
  ) {
    super(message);
    this.name = 'UmBriefEngineEntitlementError';
  }
}

function normalizeProvider(
  raw: UmBriefEngineEntitlementInput['med_review_provider'],
): MedReviewProvider | null {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim().toLowerCase();
  if (value === 'vanta' || value === 'vantahg' || value === 'vanta_hg') return 'vanta';
  if (value === 'third_party' || value === 'third-party' || value === 'other') return 'third_party';
  if (value === 'none' || value === 'standalone') return 'none';
  return 'third_party';
}

/**
 * Source of truth for Brief Engine access under a paid Med Review contract.
 *
 * Granted only when `vanta_med_review_contract === true` and the med-review
 * shop is Vanta (or omitted, which means “Vanta under that contract”).
 */
export function evaluateUmBriefEngineAccess(
  input: UmBriefEngineEntitlementInput | null | undefined,
): UmBriefEngineAccess {
  const provider = normalizeProvider(input?.med_review_provider);

  if (provider === 'third_party') {
    return {
      allowed: false,
      code: 'third_party_med_review',
      reason: THIRD_PARTY_DENIAL_REASON,
    };
  }

  if (input?.vanta_med_review_contract !== true) {
    if (provider === 'none') {
      return {
        allowed: false,
        code: 'standalone_um_not_offered',
        reason: STANDALONE_UM_DENIAL_REASON,
      };
    }
    return {
      allowed: false,
      code: 'missing_vanta_med_review_contract',
      reason: MISSING_CONTRACT_DENIAL_REASON,
    };
  }

  return {
    allowed: true,
    code: 'granted',
    reason: GRANTED_REASON,
  };
}

export function hasFreeUmBriefEngineAccess(
  input: UmBriefEngineEntitlementInput | null | undefined,
): boolean {
  return evaluateUmBriefEngineAccess(input).allowed;
}

export function assertUmBriefEngineAccess(
  input: UmBriefEngineEntitlementInput | null | undefined,
  clientId?: string,
): asserts input is UmBriefEngineEntitlementInput {
  const decision = evaluateUmBriefEngineAccess(input);
  if (!decision.allowed) {
    throw new UmBriefEngineEntitlementError(decision.code, decision.reason, clientId);
  }
}

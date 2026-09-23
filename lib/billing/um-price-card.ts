/**
 * Two-line UM price card (locked 2026-09-23).
 *
 * Working decision: docs/customer-ready/pricing-strategy-memo-2026-09-23.md.
 * Dollar amounts in this module match that memo. Do not edit them here.
 * Supersedes the review-only card from PR #78.
 * Routes and invoice code read this module. Do not hardcode these
 * numbers in API routes.
 *
 * Operating targets are canonical (memo §8). They are not "unrestated"
 * and they are not prices or billing gates: auto ≥55% by month 12,
 * nurse handle time ≤18 minutes, MD share of inbound ≤8%,
 * external share of inbound ≤2.5%, first-pass ≥90%.
 *
 * Pricing rule R16 (commercial step-down) is NOT auth-workflow R16.
 * Commercial R10–R13 are NOT auth-workflow R10–R13
 * (lib/case-spine/rules-catalog.ts). See um-pricing-rules.md.
 */

export const REVIEW_ROUTES = ['auto', 'nurse', 'md', 'external'] as const;
export type ReviewRoute = (typeof REVIEW_ROUTES)[number];

export const UM_DENOMINATORS = {
  /** Broker quotes. PEPM. */
  employees: 333_000,
  /** CFO / stop-loss / UM vendor quotes. PMPM. */
  lives: 500_000,
  /** Annual inbound auths. Not a rate denominator by itself. */
  inboundAnnual: 750_000,
} as const;

export const UM_PRICE_CARD = {
  platform: {
    defaultPmpm: 1.5,
    bandMin: 1.25,
    bandMax: 1.75,
    floor: 1.25,
    /** Contract: platform never steps down with the auto-rate. */
    stepsDown: false,
  },
  review: {
    auto: { charge: 0, cost: 3 },
    nurse: { charge: 85, bandMin: 75, bandMax: 95, cost: 35 },
    md: { charge: 200, bandMin: 175, bandMax: 225, cost: 80 },
    /**
     * List band is cost + $50–75. Card charge $350 = cost $280 + $70.
     * The ≥70% step-down ($315) is below that list band. It is still
     * the contract price. Do not "correct" it.
     */
    external: { charge: 350, marginMin: 50, marginMax: 75, cost: 280 },
  },
  /**
   * Pricing rule R16. Keyed to trailing-90-day auto-rate.
   * 50–59% is the card. Below 50% was not given its own band.
   */
  stepDown: [
    {
      id: 'card',
      minInclusive: 0,
      maxExclusive: 0.6,
      nurse: 85,
      md: 200,
      external: 350,
    },
    {
      id: 'r16_60',
      minInclusive: 0.6,
      maxExclusive: 0.7,
      nurse: 75,
      md: 185,
      external: 330,
    },
    {
      id: 'r16_70',
      minInclusive: 0.7,
      maxExclusive: Number.POSITIVE_INFINITY,
      nurse: 70,
      md: 175,
      external: 315,
    },
  ],
} as const;

/**
 * R18. Quote model only: MD + external together are capped at 12% of inbound.
 * Not a per-case billing gate. Base mix is 9% + 3% = 12%.
 */
export const MD_EXTERNAL_QUOTE_CAP = 0.12;

/** Mutually exclusive base mix on 750k inbound. */
export const BASE_MIX = {
  auto: { share: 0.5, count: 375_000 },
  nurse: { share: 0.38, count: 285_000 },
  md: { share: 0.09, count: 67_500 },
  external: { share: 0.03, count: 22_500 },
} as const;

/**
 * Deck figures as published (rounded millions).
 * Hundredths of a million so 9.00 + 24.23 + 13.50 + 7.88 = 54.61
 * without binary float drift.
 */
export const DECK_MILLION_HUNDREDTHS = {
  platform: 900,
  nurse: 2423,
  md: 1350,
  external: 788,
  totalRevenue: 5461,
  cogsRules: 113,
  cogsNurse: 998,
  cogsMd: 540,
  cogsExternal: 630,
  variableCogs: 2281,
  contribution: 3180,
  planningProfitLow: 2200,
  planningProfitHigh: 2600,
  planningProfitMid: 2400,
} as const;

/** Published unit rates. PEPM uses 333k EE. PMPM uses 500k lives. */
export const PUBLISHED_UNIT_RATES = {
  platformPepm: 2.25,
  platformPmpm: 1.5,
  reviewsPepm: 11.42,
  reviewsPmpm: 7.61,
  totalPepm: 13.67,
  totalPmpm: 9.11,
  variableGrossPepm: 7.97,
  variableGrossPmpm: 5.3,
  planningProfitPepm: 6,
  planningProfitPmpm: 4,
} as const;

/**
 * Mix sensitivity outputs at the $1.50 platform (platform stays $9M).
 * Memo §6 also states variable COGS ($18.4M / $22.8M / $27.3M) on the
 * rate card. This object does not store that column.
 * Nurse / MD / external volume splits inside lean and heavy are not
 * in the memo. Do not back-solve a mix from these totals.
 */
export const MIX_SENSITIVITY = {
  platformAnnual: 9_000_000,
  lean60: {
    autoShare: 0.6,
    review: 36_100_000,
    total: 45_100_000,
    contribution: 26_700_000,
    pmpm: 7.52,
    pepm: 11.29,
  },
  base50: {
    autoShare: 0.5,
    review: 45_600_000,
    total: 54_600_000,
    contribution: 31_800_000,
    pmpm: 9.11,
    pepm: 13.67,
  },
  heavy40: {
    autoShare: 0.4,
    review: 55_200_000,
    total: 64_200_000,
    contribution: 36_900_000,
    pmpm: 10.7,
    pepm: 16.07,
  },
} as const;

const TOUCH_RANK: Record<ReviewRoute, number> = {
  auto: 0,
  nurse: 1,
  md: 2,
  external: 3,
};

export function isReviewRoute(value: unknown): value is ReviewRoute {
  return typeof value === 'string' && (REVIEW_ROUTES as readonly string[]).includes(value);
}

export function highestTouch(stack: readonly ReviewRoute[]): ReviewRoute {
  if (stack.length === 0) {
    throw new Error('highest-touch requires a non-empty touch stack');
  }
  return stack.reduce((best, next) => (TOUCH_RANK[next] > TOUCH_RANK[best] ? next : best));
}

/** auto_count / inbound_count. Caller already dropped voids and duplicates. */
export function autoRate(autoCount: number, inboundCount: number): number {
  if (!Number.isFinite(autoCount) || !Number.isFinite(inboundCount)) {
    throw new Error('auto-rate counts must be finite');
  }
  if (inboundCount <= 0) return 0;
  if (autoCount < 0 || autoCount > inboundCount) {
    throw new Error('auto_count must be between 0 and inbound_count');
  }
  return autoCount / inboundCount;
}

export function stepDownBand(autoRateValue: number) {
  if (!Number.isFinite(autoRateValue) || autoRateValue < 0 || autoRateValue > 1) {
    throw new Error('trailing auto-rate must be between 0 and 1');
  }
  const band = UM_PRICE_CARD.stepDown.find(
    (row) => autoRateValue >= row.minInclusive && autoRateValue < row.maxExclusive,
  );
  if (!band) {
    throw new Error('no R16 step-down band for auto-rate');
  }
  return band;
}

export function reviewCharge(tier: ReviewRoute, autoRateValue: number): number {
  if (tier === 'auto') return UM_PRICE_CARD.review.auto.charge;
  const band = stepDownBand(autoRateValue);
  return band[tier];
}

export function reviewCost(tier: ReviewRoute): number {
  return UM_PRICE_CARD.review[tier].cost;
}

/**
 * $0 only when the caller explicitly waives (fat TPA admin PEPM).
 * This function does not infer a waiver from packaging.
 */
export function resolvePlatformPmpm(input: { pmpm?: number; waived?: boolean } = {}): number {
  if (input.waived) {
    if (input.pmpm != null && input.pmpm !== 0) {
      throw new Error('a waived platform fee must be $0');
    }
    return 0;
  }
  const rate = input.pmpm ?? UM_PRICE_CARD.platform.defaultPmpm;
  if (rate < UM_PRICE_CARD.platform.floor || rate > UM_PRICE_CARD.platform.bandMax) {
    throw new Error('platform PMPM is outside the $1.25–$1.75 band');
  }
  return rate;
}

export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface UmCasePricingFields {
  route: ReviewRoute | null;
  billable: boolean;
  bill_tier: ReviewRoute | null;
  charge_amount: number | null;
  cost_amount: number | null;
  auto_reason: string | null;
  gold_card: boolean;
  touch_stack: ReviewRoute[];
}

export function blankUmPricing(): UmCasePricingFields {
  return {
    route: null,
    billable: false,
    bill_tier: null,
    charge_amount: null,
    cost_amount: null,
    auto_reason: null,
    gold_card: false,
    touch_stack: [],
  };
}

export function priceTouchStack(input: {
  touchStack: readonly ReviewRoute[];
  autoRateValue: number;
  autoReason?: string | null;
  goldCard?: boolean;
  excluded?: boolean;
}): UmCasePricingFields {
  const tier = highestTouch(input.touchStack);
  const goldCard = input.goldCard === true;
  const touchStack = [...input.touchStack];

  // R8 + R19. Gold-card routes to auto. No review fee. The row still posts at $0.
  // Cost is the locked rules/auto cost ($3), not a new rate. Touch stack is kept.
  if (goldCard) {
    const charge = 0;
    const cost = input.excluded ? 0 : reviewCost('auto');
    return {
      route: 'auto',
      billable: false,
      bill_tier: 'auto',
      charge_amount: charge,
      cost_amount: cost,
      auto_reason: input.autoReason ?? 'gold_card',
      gold_card: true,
      touch_stack: touchStack,
    };
  }

  const charge = input.excluded ? 0 : reviewCharge(tier, input.autoRateValue);
  const cost = input.excluded ? 0 : reviewCost(tier);
  return {
    route: tier,
    billable: !input.excluded && tier !== 'auto',
    bill_tier: tier,
    charge_amount: charge,
    cost_amount: cost,
    auto_reason: input.autoReason ?? null,
    gold_card: false,
    touch_stack: touchStack,
  };
}

export interface AutoRateCase {
  route: ReviewRoute | null;
  state?: string | null;
  duplicate_of_case_id?: string | null;
  received_at: string;
}

export function isUmVoidOrDuplicate(row: {
  state?: string | null;
  duplicate_of_case_id?: string | null;
}): boolean {
  if (row.duplicate_of_case_id) return true;
  return row.state === 'cancelled_by_client' || row.state === 'withdrawn';
}

/** Final route is auto. Mix shares are mutually exclusive, so escalated cases are not auto. */
export function trailingAutoRate(
  cases: readonly AutoRateCase[],
  asOf: Date,
  windowDays = 90,
): number {
  const start = asOf.getTime() - windowDays * 86_400_000;
  const end = asOf.getTime();
  const inbound = cases.filter((row) => {
    if (isUmVoidOrDuplicate(row)) return false;
    const at = new Date(row.received_at).getTime();
    return at >= start && at <= end;
  });
  const autoCount = inbound.filter((row) => row.route === 'auto').length;
  return autoRate(autoCount, inbound.length);
}

export interface BaseYearExact {
  platform: number;
  nurse: number;
  md: number;
  external: number;
  reviewRevenue: number;
  totalRevenue: number;
  rulesCogs: number;
  nurseCogs: number;
  mdCogs: number;
  externalCogs: number;
  variableCogs: number;
  contribution: number;
}

/** Unrounded dollar products. Deck millions are a separate published rounding. */
export function baseYearExact(): BaseYearExact {
  const platform = UM_DENOMINATORS.lives * UM_PRICE_CARD.platform.defaultPmpm * 12;
  const nurse = BASE_MIX.nurse.count * UM_PRICE_CARD.review.nurse.charge;
  const md = BASE_MIX.md.count * UM_PRICE_CARD.review.md.charge;
  const external = BASE_MIX.external.count * UM_PRICE_CARD.review.external.charge;
  const rulesCogs = BASE_MIX.auto.count * UM_PRICE_CARD.review.auto.cost;
  const nurseCogs = BASE_MIX.nurse.count * UM_PRICE_CARD.review.nurse.cost;
  const mdCogs = BASE_MIX.md.count * UM_PRICE_CARD.review.md.cost;
  const externalCogs = BASE_MIX.external.count * UM_PRICE_CARD.review.external.cost;
  const reviewRevenue = nurse + md + external;
  const totalRevenue = platform + reviewRevenue;
  const variableCogs = rulesCogs + nurseCogs + mdCogs + externalCogs;
  return {
    platform,
    nurse,
    md,
    external,
    reviewRevenue,
    totalRevenue,
    rulesCogs,
    nurseCogs,
    mdCogs,
    externalCogs,
    variableCogs,
    contribution: totalRevenue - variableCogs,
  };
}

export function deckMillions(hundredths: number): number {
  return hundredths / 100;
}

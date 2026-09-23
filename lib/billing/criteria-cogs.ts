/**
 * Criteria-engine COGS is required on every priced review (B5).
 *
 * The 2026-09-23 lock gives fully loaded path costs
 * (rules $3 / nurse $35 / MD $80 / external $280). It does not split
 * MCG / InterQual out of those figures. This stub refuses to price a
 * route without a criteria quote, and it does not add a second fee.
 *
 * Planning band for criteria + residual intake / licenses is $2–5M
 * (required COGS, memo §4). That band is not a per-case add-on and
 * is not folded into variable COGS ($22.8M).
 */

import { reviewCost, type ReviewRoute } from './um-price-card';

export const CRITERIA_COGS_SPLIT = 'TODO_unsplit_inside_fully_loaded_path_cost' as const;

export interface CriteriaCogsQuote {
  route: ReviewRoute;
  fully_loaded_cost: number;
  criteria_engine: 'required_stub';
  criteria_split: typeof CRITERIA_COGS_SPLIT;
}

export function requireCriteriaCogs(route: ReviewRoute): CriteriaCogsQuote {
  return {
    route,
    fully_loaded_cost: reviewCost(route),
    criteria_engine: 'required_stub',
    criteria_split: CRITERIA_COGS_SPLIT,
  };
}

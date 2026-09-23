/**
 * Dashboard tiles for the two-line card.
 * Planning-lock tiles use the published denominators.
 * Book tiles are the in-memory / live case mix and are labeled separately.
 * First-pass % has no definition in the 2026-09-23 lock.
 */

import {
  BASE_MIX,
  PUBLISHED_UNIT_RATES,
  UM_DENOMINATORS,
  baseYearExact,
  isUmVoidOrDuplicate,
  type ReviewRoute,
} from './um-price-card';

export const FIRST_PASS_TODO =
  'TODO: first-pass % was named as a tile but not defined in the 2026-09-23 lock';

export interface UmPricingTiles {
  scope: 'planning_lock' | 'book';
  inbound: number;
  auto_pct: number | null;
  nurse_pct: number | null;
  md_pct: number | null;
  external_pct: number | null;
  first_pass_pct: null;
  first_pass_note: typeof FIRST_PASS_TODO;
  billed_pepm: number | null;
  billed_pmpm: number | null;
  contribution: number | null;
  denominator_label: string;
  unclassified: number;
}

function pct(count: number, inbound: number): number | null {
  if (inbound <= 0) return null;
  return Math.round((count / inbound) * 10000) / 100;
}

export function planningLockTiles(): UmPricingTiles {
  const year = baseYearExact();
  const inbound = UM_DENOMINATORS.inboundAnnual;
  return {
    scope: 'planning_lock',
    inbound,
    auto_pct: BASE_MIX.auto.share * 100,
    nurse_pct: BASE_MIX.nurse.share * 100,
    md_pct: BASE_MIX.md.share * 100,
    external_pct: BASE_MIX.external.share * 100,
    first_pass_pct: null,
    first_pass_note: FIRST_PASS_TODO,
    billed_pepm: PUBLISHED_UNIT_RATES.totalPepm,
    billed_pmpm: PUBLISHED_UNIT_RATES.totalPmpm,
    contribution: year.contribution,
    denominator_label: 'Broker PEPM = 333k EE. CFO PMPM = 500k lives. Planning lock, not the live book.',
    unclassified: 0,
  };
}

export interface BookTileCase {
  route: ReviewRoute | null;
  state?: string | null;
  duplicate_of_case_id?: string | null;
  charge_amount?: number | null;
  cost_amount?: number | null;
  excluded?: boolean;
}

export function bookTiles(
  cases: readonly BookTileCase[],
  input: { employees?: number | null; lives?: number | null } = {},
): UmPricingTiles {
  const inboundRows = cases.filter((row) => !row.excluded && !isUmVoidOrDuplicate(row));
  const inbound = inboundRows.length;
  const count = (route: ReviewRoute) => inboundRows.filter((row) => row.route === route).length;
  const unclassified = inboundRows.filter((row) => row.route == null).length;
  const reviewBilled = inboundRows.reduce((sum, row) => sum + (row.charge_amount ?? 0), 0);
  const reviewCost = inboundRows.reduce((sum, row) => sum + (row.cost_amount ?? 0), 0);
  const employees = input.employees ?? null;
  const lives = input.lives ?? null;
  const hasDenoms = Boolean(employees && employees > 0 && lives && lives > 0);
  return {
    scope: 'book',
    inbound,
    auto_pct: pct(count('auto'), inbound),
    nurse_pct: pct(count('nurse'), inbound),
    md_pct: pct(count('md'), inbound),
    external_pct: pct(count('external'), inbound),
    first_pass_pct: null,
    first_pass_note: FIRST_PASS_TODO,
    billed_pepm: hasDenoms ? Math.round((reviewBilled / employees!) * 100) / 100 : null,
    billed_pmpm: hasDenoms ? Math.round((reviewBilled / lives!) * 100) / 100 : null,
    contribution: Math.round((reviewBilled - reviewCost) * 100) / 100,
    denominator_label: hasDenoms
      ? `Book PEPM uses ${employees} employees. Book PMPM uses ${lives} lives. Review charges only; platform is separate.`
      : 'Book mix has no employee/lives counts on this request, so PEPM and PMPM are omitted.',
    unclassified,
  };
}

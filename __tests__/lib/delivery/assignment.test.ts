import { describe, it, expect } from 'vitest';
import { pickLeastLoadedConcierge, type ConciergeWithLoad } from '@/lib/delivery/assignment';
import { filterIndependentReviewers, type LineageLoader } from '@/lib/reviewer-independence';

function makeConcierge(overrides: Partial<ConciergeWithLoad> = {}): ConciergeWithLoad {
  return {
    id: overrides.id ?? 'c1',
    name: 'C',
    email: 'c@x.test',
    weekly_auth_cap: 300,
    delivery_lead_id: null,
    active: true,
    estimated_weekly_load: 0,
    active_client_count: 0,
    utilization: 0,
    ...overrides,
  };
}

describe('pickLeastLoadedConcierge', () => {
  it('returns null when no concierges exist', () => {
    expect(pickLeastLoadedConcierge([], 50)).toBeNull();
  });

  it('returns null when no concierge has room for the incoming volume', () => {
    const pool = [
      makeConcierge({ id: 'a', estimated_weekly_load: 290 }),
      makeConcierge({ id: 'b', estimated_weekly_load: 280 }),
    ];
    expect(pickLeastLoadedConcierge(pool, 100)).toBeNull();
  });

  it('picks the one with the most spare capacity', () => {
    const pool = [
      makeConcierge({ id: 'busy', estimated_weekly_load: 250 }),
      makeConcierge({ id: 'open', estimated_weekly_load: 50 }),
      makeConcierge({ id: 'medium', estimated_weekly_load: 150 }),
    ];
    expect(pickLeastLoadedConcierge(pool, 25)?.id).toBe('open');
  });

  it('tie-breaks on active_client_count (prefers fewer clients when capacity equal)', () => {
    const pool = [
      makeConcierge({ id: 'spread', estimated_weekly_load: 100, active_client_count: 5 }),
      makeConcierge({ id: 'concentrated', estimated_weekly_load: 100, active_client_count: 2 }),
    ];
    expect(pickLeastLoadedConcierge(pool, 50)?.id).toBe('concentrated');
  });

  it('ignores inactive concierges', () => {
    const pool = [
      makeConcierge({ id: 'off', active: false, estimated_weekly_load: 0 }),
      makeConcierge({ id: 'on', active: true, estimated_weekly_load: 100 }),
    ];
    expect(pickLeastLoadedConcierge(pool, 50)?.id).toBe('on');
  });

  it('respects per-concierge weekly_auth_cap (not a global default)', () => {
    const pool = [
      makeConcierge({ id: 'small-cap', weekly_auth_cap: 100, estimated_weekly_load: 60 }),
      makeConcierge({ id: 'big-cap', weekly_auth_cap: 500, estimated_weekly_load: 100 }),
    ];
    // small-cap has spare = 40; big-cap has spare = 400. big-cap should win.
    expect(pickLeastLoadedConcierge(pool, 30)?.id).toBe('big-cap');
  });
});

// IRO/IRE independence — REAL test against the central module that replaced the
// hardcoded `reviewer-001` wall. An IRO case carries appeal_of_case_id, so the
// reviewer who decided the original case is excluded from the IRO review.
describe('IRO independence via the central reviewer-independence module', () => {
  // IRO case VUM-IRO-0401 links to its original via appeal_of_case_id; the
  // original was decided by rev-001 (see lib/demo-data.ts iro case).
  const iroCase = { id: 'iro-401', appeal_of_case_id: 'orig-mri' };
  const loader: LineageLoader = {
    loadCaseTouchpoints: async () => ({ assigned_reviewer_id: 'rev-001', determined_by: 'rev-001' }),
    loadOriginalDenyingReviewerId: async () => 'rev-001',
  };

  it('EXCLUDES the original reviewer (rev-001) from the IRO review pool', async () => {
    const out = await filterIndependentReviewers(
      iroCase,
      [{ id: 'rev-001' }, { id: 'rev-009' }],
      loader,
    );
    expect(out.map((r) => r.id)).toEqual(['rev-009']);
    expect(out.some((r) => r.id === 'rev-001')).toBe(false);
  });

  it('FAILS CLOSED (empty pool) when rev-001 is the only candidate for the IRO', async () => {
    const out = await filterIndependentReviewers(iroCase, [{ id: 'rev-001' }], loader);
    expect(out).toHaveLength(0);
  });
});

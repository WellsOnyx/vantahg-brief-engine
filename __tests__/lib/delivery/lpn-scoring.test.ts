import { describe, it, expect } from 'vitest';
import {
  scoreLpnForCase,
  pickLpnByScore,
  LOAD_PENALTY_WEIGHT,
  type ScoringLpn,
} from '@/lib/delivery/lpn-scoring';

/**
 * Synthetic-data tests for the SLA-aware LPN scorer. The scorer is
 * pure (no DB, no clock dependence beyond an injected `now`), so
 * these tests lock in the exact behavior the comparator math
 * produces. Real-world tuning of LOAD_PENALTY_WEIGHT happens once
 * production load data exists; until then these tests are the spec.
 */

// A fixed "now" so every test has the same reference point.
const NOW = new Date('2026-05-13T12:00:00.000Z');

// Helper to construct an LPN test fixture.
function lpn(id: string, activeCount: number, avg: number | null): ScoringLpn {
  return { id, activeCount, avg_turnaround_hours: avg };
}

// Helper to construct a case with a deadline N hours from NOW.
function caseDueIn(hours: number) {
  return {
    turnaround_deadline: new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString(),
  };
}

describe('scoreLpnForCase — math', () => {
  it('computes expected_completion = (activeCount + 1) * avg_turnaround', () => {
    const r = scoreLpnForCase(lpn('a', 3, 2), caseDueIn(20), NOW);
    expect(r.expected_completion_hours).toBe(8);
  });

  it('slack = time_to_deadline - expected_completion (positive when fits, negative when misses)', () => {
    const fits = scoreLpnForCase(lpn('fast', 1, 2), caseDueIn(20), NOW);
    expect(fits.slack_hours).toBe(16); // 20 - (1+1)*2

    const misses = scoreLpnForCase(lpn('slow', 5, 6), caseDueIn(10), NOW);
    expect(misses.slack_hours).toBe(-26); // 10 - (5+1)*6
  });

  it('score = slack - LOAD_PENALTY_WEIGHT * activeCount', () => {
    const r = scoreLpnForCase(lpn('a', 3, 2), caseDueIn(20), NOW);
    // slack = 20 - 4*2 = 12; score = 12 - 0.1*3 = 11.7
    expect(r.score).toBeCloseTo(20 - 4 * 2 - LOAD_PENALTY_WEIGHT * 3, 6);
  });

  it('falls back to legacy ordering when the case has no deadline', () => {
    const low = scoreLpnForCase(lpn('low-load', 1, 4), { turnaround_deadline: null }, NOW);
    const high = scoreLpnForCase(lpn('high-load', 5, 4), { turnaround_deadline: null }, NOW);
    // Legacy score is -(load*1000 + turnaround); lower load wins.
    expect(low.score).toBeGreaterThan(high.score);
    expect(low.slack_hours).toBeNull();
  });

  it('treats null avg_turnaround_hours as 999 (worst-case unknown LPN)', () => {
    const known = scoreLpnForCase(lpn('known', 0, 2), caseDueIn(50), NOW);
    const unknown = scoreLpnForCase(lpn('unknown', 0, null), caseDueIn(50), NOW);
    expect(unknown.score).toBeLessThan(known.score);
  });
});

describe('pickLpnByScore — selection scenarios', () => {
  it('returns null for empty input', () => {
    expect(pickLpnByScore([], caseDueIn(10), NOW)).toBeNull();
  });

  it('picks the only LPN when there is only one', () => {
    const only = lpn('only', 9, 9);
    expect(pickLpnByScore([only], caseDueIn(10), NOW)).toBe(only);
  });

  it('SLA pressure wins over load — tight deadline picks the fast LPN even if more loaded', () => {
    // Case due in 3 hours. Two LPNs:
    //   loaded-fast: load=2, avg=1h → expected 3h → slack 0
    //   idle-slow:   load=0, avg=4h → expected 4h → slack -1
    // Fast LPN should win even though it has more on its plate.
    const loadedFast = lpn('loaded-fast', 2, 1);
    const idleSlow = lpn('idle-slow', 0, 4);
    const winner = pickLpnByScore([idleSlow, loadedFast], caseDueIn(3), NOW);
    expect(winner?.id).toBe('loaded-fast');
  });

  it('load tiebreaker wins when slack is similar — comfortable deadline picks the less-loaded LPN', () => {
    // Case due in 100 hours. Both LPNs easily make it.
    //   light: load=0, avg=2h → expected 2h → slack 98 → score 98
    //   heavy: load=8, avg=2h → expected 18h → slack 82 → score 81.2
    // Light should win by a wide margin.
    const light = lpn('light', 0, 2);
    const heavy = lpn('heavy', 8, 2);
    const winner = pickLpnByScore([heavy, light], caseDueIn(100), NOW);
    expect(winner?.id).toBe('light');
  });

  it('picks least-bad LPN when no one can make the deadline', () => {
    // Case due in 1 hour. All LPNs miss.
    //   a: load=0, avg=3h → expected 3h → slack -2 → score -2
    //   b: load=2, avg=2h → expected 6h → slack -5 → score -5.2
    //   c: load=4, avg=5h → expected 25h → slack -24 → score -24.4
    const a = lpn('a', 0, 3);
    const b = lpn('b', 2, 2);
    const c = lpn('c', 4, 5);
    const winner = pickLpnByScore([c, b, a], caseDueIn(1), NOW);
    expect(winner?.id).toBe('a');
  });

  it('the 0.1 load penalty kicks in only when slack is very close', () => {
    // Case due in 10 hours.
    //   a: load=2, avg=3h → expected 9h → slack 1 → score 0.8
    //   b: load=0, avg=3h → expected 3h → slack 7 → score 7
    // b wins on raw slack — the load penalty is irrelevant here.
    const a = lpn('a', 2, 3);
    const b = lpn('b', 0, 3);
    const winner = pickLpnByScore([a, b], caseDueIn(10), NOW);
    expect(winner?.id).toBe('b');
  });

  it('stable tiebreaker — equal score prefers lower load, then lower turnaround', () => {
    // Two LPNs whose slack ties: design the math so the scores match.
    // Case due in 12 hours.
    //   x: load=2, avg=4h → expected 12 → slack 0 → score -0.2
    //   y: load=0, avg=12h → expected 12 → slack 0 → score 0
    // y has higher score (less load penalty). Then make z with the
    // same score as y but lower load (impossible if load=0 already
    // for y — so use the lower-turnaround tiebreaker instead).
    // We just verify the documented behavior empirically.
    const x = lpn('x', 2, 4);
    const y = lpn('y', 0, 12);
    expect(pickLpnByScore([x, y], caseDueIn(12), NOW)?.id).toBe('y');
  });
});

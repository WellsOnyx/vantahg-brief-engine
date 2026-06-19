import { describe, it, expect } from 'vitest';
import {
  buildDayPlan,
  DEFAULT_TURNAROUND_HOURS,
  TIGHT_SLACK_THRESHOLD_HOURS,
} from '@/lib/clinician/day-planner';

/**
 * Pure-math tests for the clinician day planner — no DB, no clock.
 * Mirrors the style of __tests__/lib/delivery/lpn-scoring.test.ts:
 * a fixed `now` so every projection is deterministic.
 */

const NOW = new Date('2026-06-12T12:00:00.000Z');

function hoursFromNow(h: number): string {
  return new Date(NOW.getTime() + h * 60 * 60 * 1000).toISOString();
}

function makeCase(id: string, deadlineHours: number | null) {
  return {
    id,
    turnaround_deadline: deadlineHours === null ? null : hoursFromNow(deadlineHours),
  };
}

describe('buildDayPlan ordering', () => {
  it('orders cases earliest-deadline-first', () => {
    const plan = buildDayPlan(
      [makeCase('late', 10), makeCase('soon', 2), makeCase('mid', 5)],
      { avg_turnaround_hours: 1, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.ordered.map((p) => p.case.id)).toEqual(['soon', 'mid', 'late']);
    expect(plan.next_case_id).toBe('soon');
  });

  it('places deadline-less cases after deadline-bearing ones, in stable input order', () => {
    const plan = buildDayPlan(
      [makeCase('none-a', null), makeCase('dated', 4), makeCase('none-b', null)],
      { avg_turnaround_hours: 1, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.ordered.map((p) => p.case.id)).toEqual(['dated', 'none-a', 'none-b']);
  });

  it('returns an empty plan for an empty queue', () => {
    const plan = buildDayPlan([], { avg_turnaround_hours: 1, max_cases_per_day: 10 }, NOW);
    expect(plan.ordered).toEqual([]);
    expect(plan.next_case_id).toBeNull();
    expect(plan.feasibility).toBe('on_track');
    expect(plan.total_projected_hours).toBe(0);
    expect(plan.min_slack_hours).toBeNull();
  });
});

describe('buildDayPlan projection math', () => {
  it('projects serial finish times at k * avg_turnaround', () => {
    const plan = buildDayPlan(
      [makeCase('a', 10), makeCase('b', 11), makeCase('c', 12)],
      { avg_turnaround_hours: 2, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.ordered.map((p) => p.projected_finish_hours)).toEqual([2, 4, 6]);
    expect(plan.ordered[2].projected_finish_at).toBe(hoursFromNow(6));
    expect(plan.total_projected_hours).toBe(6);
  });

  it('computes slack as time-to-deadline minus projected finish', () => {
    const plan = buildDayPlan(
      [makeCase('a', 3)],
      { avg_turnaround_hours: 2, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.ordered[0].slack_hours).toBeCloseTo(1, 5);
    expect(plan.ordered[0].projected_miss).toBe(false);
  });

  it('flags a projected miss when the queue depth pushes a case past its deadline', () => {
    // Two cases, 2h each. Second case due in 3h → finishes at 4h → 1h late.
    const plan = buildDayPlan(
      [makeCase('first', 2.5), makeCase('second', 3)],
      { avg_turnaround_hours: 2, max_cases_per_day: 10 },
      NOW,
    );
    const second = plan.ordered.find((p) => p.case.id === 'second')!;
    expect(second.slack_hours).toBeCloseTo(-1, 5);
    expect(second.projected_miss).toBe(true);
    expect(plan.projected_misses).toBe(1);
  });

  it('tracks min_slack_hours across deadline-bearing cases only', () => {
    const plan = buildDayPlan(
      [makeCase('a', 5), makeCase('b', 4), makeCase('none', null)],
      { avg_turnaround_hours: 1, max_cases_per_day: 10 },
      NOW,
    );
    // EDF order: b (finish 1h, slack 3h), a (finish 2h, slack 3h), none.
    expect(plan.min_slack_hours).toBeCloseTo(3, 5);
    const none = plan.ordered.find((p) => p.case.id === 'none')!;
    expect(none.slack_hours).toBeNull();
    expect(none.projected_miss).toBe(false);
  });
});

describe('buildDayPlan feasibility verdict', () => {
  it('reads on_track when every margin clears the tight threshold', () => {
    const plan = buildDayPlan(
      [makeCase('a', 8)],
      { avg_turnaround_hours: 1, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.feasibility).toBe('on_track');
  });

  it('reads tight when the thinnest margin is under the threshold but positive', () => {
    const plan = buildDayPlan(
      [makeCase('a', 1 + TIGHT_SLACK_THRESHOLD_HOURS / 2)],
      { avg_turnaround_hours: 1, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.feasibility).toBe('tight');
    expect(plan.projected_misses).toBe(0);
  });

  it('reads at_risk when any case is projected to miss', () => {
    const plan = buildDayPlan(
      [makeCase('a', 0.5)],
      { avg_turnaround_hours: 1, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.feasibility).toBe('at_risk');
  });
});

describe('buildDayPlan turnaround assumption and capacity', () => {
  it('assumes the default pace when the clinician has no history, and flags it', () => {
    const plan = buildDayPlan(
      [makeCase('a', 10)],
      { avg_turnaround_hours: null, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.assumed_turnaround).toBe(true);
    expect(plan.turnaround_hours).toBe(DEFAULT_TURNAROUND_HOURS);
    expect(plan.ordered[0].projected_finish_hours).toBe(DEFAULT_TURNAROUND_HOURS);
  });

  it('does not flag the assumption when real history exists', () => {
    const plan = buildDayPlan(
      [makeCase('a', 10)],
      { avg_turnaround_hours: 1.2, max_cases_per_day: 10 },
      NOW,
    );
    expect(plan.assumed_turnaround).toBe(false);
    expect(plan.turnaround_hours).toBe(1.2);
  });

  it('computes capacity utilization against max_cases_per_day', () => {
    const plan = buildDayPlan(
      [makeCase('a', 10), makeCase('b', 11), makeCase('c', 12)],
      { avg_turnaround_hours: 1, max_cases_per_day: 12 },
      NOW,
    );
    expect(plan.capacity).toEqual({ active_count: 3, max_cases_per_day: 12, utilization: 0.25 });
  });

  it('returns null utilization when no daily target is set', () => {
    const plan = buildDayPlan(
      [makeCase('a', 10)],
      { avg_turnaround_hours: 1, max_cases_per_day: null },
      NOW,
    );
    expect(plan.capacity.utilization).toBeNull();
  });
});

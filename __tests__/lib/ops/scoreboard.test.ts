import { describe, expect, it } from 'vitest';
import type { ScoreableCase } from '@/lib/ops/scoreboard';
import {
  fanoutFailRate,
  scoreEscalations,
  scoreFanout,
  scoreStuck,
} from '@/lib/ops/scoreboard';

function row(
  overrides: Partial<ScoreableCase> & Pick<ScoreableCase, 'state'>,
): ScoreableCase {
  return {
    fanout_status: 'not_started',
    open_tasks: [],
    ...overrides,
  };
}

describe('ops scoreboard scoring (synthetic)', () => {
  it('computes fan-out fail rate from completed + failed only', () => {
    expect(fanoutFailRate(0, 0)).toBe(0);
    expect(fanoutFailRate(3, 1)).toBe(0.25);
    expect(scoreFanout([
      row({ state: 'fanout_complete', fanout_status: 'complete' }),
      row({ state: 'fanout_complete', fanout_status: 'complete' }),
      row({ state: 'fanout_failed', fanout_status: 'failed' }),
      row({ state: 'determined', fanout_status: 'pending' }),
    ], 2)).toEqual({
      complete: 2,
      failed: 1,
      pending: 1,
      attempted: 3,
      fail_rate: 0.3333,
      open_cx_tasks: 2,
    });
  });

  it('counts stuck cases as clinicals vs fan-out without listing PHI', () => {
    const cases: ScoreableCase[] = [
      row({ state: 'intake_incomplete', open_tasks: ['request_clinicals'] }),
      row({ state: 'awaiting_clinicals' }),
      row({ state: 'fanout_failed', fanout_status: 'failed', open_tasks: ['resolve_fanout'] }),
      row({ state: 'determined', fanout_status: 'complete' }),
      row({ state: 'md_queue' }),
    ];
    expect(scoreStuck(cases)).toEqual({
      count: 3,
      awaiting_clinicals: 2,
      fanout_failed: 1,
    });
    const serialized = JSON.stringify(scoreStuck(cases));
    expect(serialized).not.toMatch(/memb_|patient|ssn|dob|clinicals_pointer/i);
  });

  it('does not treat healthy open cases as stuck', () => {
    expect(scoreStuck([
      row({ state: 'received' }),
      row({ state: 'intake_validated' }),
      row({ state: 'md_queue' }),
      row({ state: 'determined', fanout_status: 'complete' }),
    ])).toEqual({ count: 0, awaiting_clinicals: 0, fanout_failed: 0 });
  });

  it('rolls up R10–R12 escalation tasks', () => {
    expect(scoreEscalations([
      row({ state: 'md_queue', open_tasks: ['escalation_l1'] }),
      row({ state: 'md_queue', open_tasks: ['escalation_l3'] }),
      row({ state: 'determined' }),
    ])).toEqual({ l1: 1, l2: 0, l3: 1, total: 2 });
  });
});

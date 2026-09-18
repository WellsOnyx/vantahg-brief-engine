import { describe, it, expect } from 'vitest';
import {
  CASE_SPINE_STATES,
  IllegalTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminalState,
} from '@/lib/case-spine';

describe('case-spine state machine (03)', () => {
  it('allows received → intake_validated | intake_incomplete', () => {
    expect(canTransition('received', 'intake_validated')).toBe(true);
    expect(canTransition('received', 'intake_incomplete')).toBe(true);
    expect(canTransition('received', 'md_queue')).toBe(false);
  });

  it('rejects illegal hops (received → determined, closed → routed)', () => {
    expect(canTransition('received', 'determined')).toBe(false);
    expect(canTransition('closed', 'routed')).toBe(false);
    expect(() => assertTransition('received', 'closed')).toThrow(IllegalTransitionError);
  });

  it('walks the happy path without illegal edges', () => {
    const path = [
      'received',
      'intake_validated',
      'routed',
      'briefing',
      'md_queue',
      'determined',
      'fanout_pending',
      'fanout_complete',
      'closed',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('lets R02 skip validate: intake_incomplete → routed', () => {
    expect(canTransition('intake_incomplete', 'routed')).toBe(true);
  });

  it('reopens via appeal_attached → briefing, including from closed', () => {
    expect(canTransition('determined', 'appeal_attached')).toBe(true);
    expect(canTransition('fanout_complete', 'appeal_attached')).toBe(true);
    expect(canTransition('closed', 'appeal_attached')).toBe(true);
    expect(canTransition('appeal_attached', 'briefing')).toBe(true);
  });

  it('treats closed / cancelled_by_client / withdrawn as terminal (except appeal reopen)', () => {
    expect(isTerminalState('closed')).toBe(true);
    expect(isTerminalState('cancelled_by_client')).toBe(true);
    expect(isTerminalState('withdrawn')).toBe(true);
    expect(allowedTransitions('cancelled_by_client')).toEqual([]);
    expect(allowedTransitions('withdrawn')).toEqual([]);
  });

  it('does not allow self-transitions', () => {
    for (const state of CASE_SPINE_STATES) {
      expect(canTransition(state, state)).toBe(false);
    }
  });
});

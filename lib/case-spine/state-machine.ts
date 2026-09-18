import {
  IllegalTransitionError,
  TERMINAL_STATES,
  type CaseSpineState,
} from './types';

/**
 * Legal edges for the 03 shared state machine.
 *
 * received → intake_validated | intake_incomplete
 *         → routed (via validate then route, or R02 skip)
 *         → briefing | awaiting_clinicals
 *         → md_queue → determined → fanout_pending → fanout_complete → closed
 * appeal_attached may reopen into briefing.
 * Terminal: closed, cancelled_by_client, withdrawn.
 *
 * fanout_failed is the 05 retry-exhausted state; it is not terminal so CX
 * can re-queue fan-out.
 */
const TRANSITIONS: Record<CaseSpineState, readonly CaseSpineState[]> = {
  received: ['intake_validated', 'intake_incomplete', 'cancelled_by_client', 'withdrawn'],
  intake_incomplete: [
    'intake_validated',
    'routed',
    'awaiting_clinicals',
    'cancelled_by_client',
    'withdrawn',
  ],
  intake_validated: ['routed', 'cancelled_by_client', 'withdrawn'],
  routed: ['briefing', 'awaiting_clinicals', 'cancelled_by_client', 'withdrawn'],
  briefing: ['md_queue', 'awaiting_clinicals', 'cancelled_by_client', 'withdrawn'],
  awaiting_clinicals: ['briefing', 'routed', 'cancelled_by_client', 'withdrawn'],
  md_queue: ['determined', 'awaiting_clinicals', 'cancelled_by_client', 'withdrawn'],
  determined: ['fanout_pending', 'appeal_attached'],
  fanout_pending: ['fanout_complete', 'fanout_failed'],
  fanout_failed: ['fanout_pending', 'closed'],
  fanout_complete: ['closed', 'appeal_attached'],
  appeal_attached: ['briefing'],
  closed: ['appeal_attached'],
  cancelled_by_client: [],
  withdrawn: [],
};

export function isTerminalState(state: CaseSpineState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function allowedTransitions(from: CaseSpineState): readonly CaseSpineState[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: CaseSpineState, to: CaseSpineState): boolean {
  if (from === to) return false;
  return allowedTransitions(from).includes(to);
}

export function assertTransition(from: CaseSpineState, to: CaseSpineState): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/**
 * Internal ops scoreboard (08 / Phase 6.3).
 * Fan-out fail rate + stuck-case count + R10–R12 escalation counts for CX / admin.
 * Aggregates only — never emit intake, member refs, or packet paths.
 */

import {
  ESCALATION_TASKS,
  getCaseSpineService,
  isEscalationCase,
  isStuckCase,
  type CanonicalCase,
  type SpineViewer,
} from '@/lib/case-spine';
import { getMemoryFanoutStore } from '@/lib/fanout/store';

export type ScoreableCase = Pick<CanonicalCase, 'state' | 'fanout_status' | 'open_tasks'>;

const CLINICALS_STUCK_STATES = ['intake_incomplete', 'awaiting_clinicals'] as const;

export interface FanoutScore {
  complete: number;
  failed: number;
  pending: number;
  attempted: number;
  fail_rate: number;
  open_cx_tasks: number;
}

export interface StuckScore {
  count: number;
  awaiting_clinicals: number;
  fanout_failed: number;
}

export interface EscalationScore {
  l1: number;
  l2: number;
  l3: number;
  total: number;
}

export interface OpsScoreboard {
  view: 'ops';
  client_id: string | null;
  fanout: FanoutScore;
  stuck: StuckScore;
  escalations: EscalationScore;
}

export function fanoutFailRate(complete: number, failed: number): number {
  const attempted = complete + failed;
  if (attempted === 0) return 0;
  return Math.round((failed / attempted) * 10000) / 10000;
}

export function isClinicalsStuck(c: ScoreableCase): boolean {
  if ((CLINICALS_STUCK_STATES as readonly string[]).includes(c.state)) return true;
  return c.open_tasks.includes('request_clinicals');
}

export function isFanoutStuck(c: ScoreableCase): boolean {
  return c.state === 'fanout_failed' || c.open_tasks.includes('resolve_fanout');
}

export function scoreFanout(cases: ScoreableCase[], openCxTasks = 0): FanoutScore {
  const complete = cases.filter((c) => c.state === 'fanout_complete' || c.fanout_status === 'complete').length;
  const failed = cases.filter((c) => c.state === 'fanout_failed' || c.fanout_status === 'failed').length;
  const pending = cases.filter((c) => c.fanout_status === 'pending').length;
  return {
    complete,
    failed,
    pending,
    attempted: complete + failed,
    fail_rate: fanoutFailRate(complete, failed),
    open_cx_tasks: openCxTasks,
  };
}

export function scoreStuck(cases: ScoreableCase[]): StuckScore {
  const stuck = cases.filter(isStuckCase);
  return {
    count: stuck.length,
    awaiting_clinicals: stuck.filter(isClinicalsStuck).length,
    fanout_failed: stuck.filter(isFanoutStuck).length,
  };
}

export function scoreEscalations(cases: ScoreableCase[]): EscalationScore {
  const flagged = cases.filter(isEscalationCase);
  const has = (task: (typeof ESCALATION_TASKS)[number]) =>
    flagged.filter((c) => c.open_tasks.includes(task)).length;
  return {
    l1: has('escalation_l1'),
    l2: has('escalation_l2'),
    l3: has('escalation_l3'),
    total: flagged.length,
  };
}

export async function buildOpsScoreboard(
  viewer: SpineViewer,
  clientId?: string | null,
): Promise<OpsScoreboard> {
  const cases = await getCaseSpineService().listCases(viewer, {
    client_id: clientId ?? undefined,
  });
  const tasks = (await getMemoryFanoutStore().listCxTasks({ status: 'open' })).filter(
    (t) => t.kind === 'resolve_fanout' && (!clientId || t.client_id === clientId),
  );
  return {
    view: 'ops',
    client_id: clientId ?? null,
    fanout: scoreFanout(cases, tasks.length),
    stuck: scoreStuck(cases),
    escalations: scoreEscalations(cases),
  };
}

/**
 * CX lens on the canonical case object (04 / Phase 5.2).
 * Account health, stuck, escalations, hypercare, non-PHI notes.
 * Clinical packet stays redacted.
 */

import {
  getCaseSpineService,
  isEscalationCase,
  isOpenCase,
  isStuckCase,
  type CanonicalCase,
  type ListCasesFilters,
  type SpineViewer,
} from '@/lib/case-spine';
import { getMemoryCxNoteStore, hypercareForClient, type CxNote, type HypercareProgress } from '@/lib/cx';
import { getMemoryFanoutStore } from '@/lib/fanout/store';
import type { CxTask } from '@/lib/fanout/types';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { buildGoLiveStatus, getMemoryGoLiveStore, type GoLiveStatus } from '@/lib/golive';

export interface CxAccountHealth {
  open: number;
  at_risk: number;
  missed: number;
  stuck: number;
  fanout_failed: number;
  escalations: number;
}

export interface CxLens {
  view: 'cx';
  client_id: string | null;
  health: CxAccountHealth;
  stuck: CanonicalCase[];
  escalations: CanonicalCase[];
  cases: CanonicalCase[];
  hypercare: HypercareProgress;
  notes: CxNote[];
  resolve_fanout: CxTask[];
  golive: GoLiveStatus;
}

export function accountHealth(cases: CanonicalCase[]): CxAccountHealth {
  const open = cases.filter(isOpenCase);
  return {
    open: open.length,
    at_risk: open.filter((c) => c.sla_status === 'at_risk').length,
    missed: open.filter((c) => c.sla_status === 'missed').length,
    stuck: cases.filter(isStuckCase).length,
    fanout_failed: cases.filter((c) => c.state === 'fanout_failed').length,
    escalations: cases.filter(isEscalationCase).length,
  };
}

export async function buildCxLens(
  viewer: SpineViewer,
  filters: ListCasesFilters = {},
): Promise<CxLens> {
  const spine = getCaseSpineService();
  const cases = await spine.listCases(viewer, filters);
  const clientId = filters.client_id ?? viewer.client_id ?? SYNTHETIC_CLIENT_ID;
  const notes = await getMemoryCxNoteStore().list({ client_id: clientId });
  const resolve_fanout = (await getMemoryFanoutStore().listCxTasks({ status: 'open' })).filter(
    (t) => t.kind === 'resolve_fanout' && (!filters.client_id || t.client_id === filters.client_id),
  );
  const extraDone = getMemoryGoLiveStore().hypercareDoneIds(clientId);
  const golive = await buildGoLiveStatus(clientId);

  return {
    view: 'cx',
    client_id: filters.client_id ?? null,
    health: accountHealth(cases),
    stuck: cases.filter(isStuckCase),
    escalations: cases.filter(isEscalationCase),
    cases,
    hypercare: hypercareForClient(clientId, extraDone.length ? extraDone : undefined),
    notes,
    resolve_fanout,
    golive,
  };
}

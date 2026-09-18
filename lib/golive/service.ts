/**
 * Go-live status + first-25 SLA evaluation (Phase 7.4).
 */

import { getCaseSpineService, type CanonicalCase } from '@/lib/case-spine';
import {
  getClientConfigService,
  resolveGoLiveMode,
  resolveSlaMissRollbackThreshold,
} from '@/lib/client-config';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { evaluateLiveHypercare } from './rollback';
import { getMemoryGoLiveStore, type MemoryGoLiveStore } from './store';
import type { GoLiveStatus, LiveHypercareEvaluation } from './types';

export function evaluateAndRecordHypercare(input: {
  client_id?: string;
  cases?: CanonicalCase[];
  actor?: string;
  store?: MemoryGoLiveStore;
  now?: Date;
}): Promise<LiveHypercareEvaluation> {
  return (async () => {
    const clientId = input.client_id ?? SYNTHETIC_CLIENT_ID;
    const store = input.store ?? getMemoryGoLiveStore();
    const now = input.now ?? new Date();
    const actor = input.actor ?? 'ops:golive';
    const cfg = await getClientConfigService().getLatest(clientId);
    const cases =
      input.cases ??
      (await getCaseSpineService().listCases(
        { id: actor, role: 'superadmin' },
        { client_id: clientId },
      ));
    const evaluation = evaluateLiveHypercare({
      client_id: clientId,
      cases,
      config: cfg?.config ?? null,
      now,
    });
    store.recordEval(evaluation);
    if (evaluation.breached && !store.hasKind(clientId, 'rollback')) {
      store.appendLog({
        client_id: clientId,
        at: evaluation.evaluated_at,
        actor,
        kind: 'rollback',
        message: evaluation.note,
        payload: {
          miss_rate: evaluation.miss_rate,
          threshold: evaluation.threshold,
          sample_size: evaluation.sample_size,
          action: evaluation.action,
        },
      });
      store.markHypercare(clientId, ['hc-18']);
    }
    return evaluation;
  })();
}

export async function buildGoLiveStatus(clientId = SYNTHETIC_CLIENT_ID): Promise<GoLiveStatus> {
  const store = getMemoryGoLiveStore();
  const cfg = await getClientConfigService().getLatest(clientId);
  let hypercare = store.lastEval(clientId);
  if (!hypercare) {
    hypercare = await evaluateAndRecordHypercare({ client_id: clientId });
  }
  return {
    client_id: clientId,
    go_live_mode: resolveGoLiveMode(cfg?.config ?? null),
    shadow_mode: resolveGoLiveMode(cfg?.config ?? null) === 'shadow',
    threshold: resolveSlaMissRollbackThreshold(cfg?.config ?? null),
    log: store.listLog(clientId),
    last_synthetic: store.lastPack(clientId, 'synthetic'),
    last_shadow: store.lastPack(clientId, 'shadow'),
    hypercare,
  };
}

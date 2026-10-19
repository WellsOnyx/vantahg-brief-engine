/**
 * Look up published client_config and evaluate Brief Engine access.
 *
 * Missing published config is not entitled (no standalone UM product).
 * Demo / spine unit tests that never publish a config skip this lookup
 * and call evaluateUmBriefEngineAccess themselves when they need the gate.
 */

import { PUBLISHED_CONFIG_REQUIRED_REASON } from '@/lib/packaging/med-review-positioning';

import {
  UmBriefEngineEntitlementError,
  evaluateUmBriefEngineAccess,
  type UmBriefEngineAccess,
} from '@/lib/entitlements/um-brief-engine';
import type { ClientConfigStore } from './store';
import type { ClientConfigFields } from './types';

export async function resolveUmBriefEngineAccessForClient(
  store: ClientConfigStore,
  clientId: string,
): Promise<UmBriefEngineAccess & { client_id: string; published: boolean }> {
  const latest = await store.getLatest(clientId);
  const decision = evaluateUmBriefEngineAccess(latest?.config ?? { vanta_med_review_contract: false });
  return {
    ...decision,
    client_id: clientId,
    published: Boolean(latest),
  };
}

export async function requireUmBriefEngineAccess(
  store: ClientConfigStore,
  clientId: string,
): Promise<ClientConfigFields> {
  const latest = await store.getLatest(clientId);
  const decision = evaluateUmBriefEngineAccess(latest?.config ?? { vanta_med_review_contract: false });
  if (!decision.allowed) {
    throw new UmBriefEngineEntitlementError(decision.code, decision.reason, clientId);
  }
  if (!latest) {
    throw new UmBriefEngineEntitlementError(
      'missing_vanta_med_review_contract',
      PUBLISHED_CONFIG_REQUIRED_REASON,
      clientId,
    );
  }
  return latest.config;
}

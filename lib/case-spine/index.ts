export * from './types';
export * from './state-machine';
export * from './required-fields';
export * from './rules-catalog';
export * from './rules-engine';
export * from './rbac';
export * from './store';
export * from './service';
export { payloadHash, hashTransitionPayload, hashRulePayload } from './hash';

import { isDemoMode } from '@/lib/demo-mode';
import { CaseSpineService } from './service';
import { getMemoryCaseSpineStore, resetMemoryCaseSpineStore } from './store';

let serviceSingleton: CaseSpineService | null = null;

/**
 * Process-local spine service. Demo / test / missing-DB paths use the
 * in-memory store so Cole does not need AWS credentials to exercise
 * create → transition → audit → R01.
 */
export function getCaseSpineService(): CaseSpineService {
  if (!serviceSingleton) {
    serviceSingleton = new CaseSpineService(getMemoryCaseSpineStore());
  }
  return serviceSingleton;
}

export function resetCaseSpineService(): CaseSpineService {
  serviceSingleton = new CaseSpineService(resetMemoryCaseSpineStore());
  return serviceSingleton;
}

export function isCaseSpineMemoryBacked(): boolean {
  return isDemoMode() || process.env.NODE_ENV === 'test';
}

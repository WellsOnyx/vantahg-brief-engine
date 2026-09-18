export * from './types';
export {
  isShadowMode,
  resolveGoLiveMode,
  resolveSlaMissRollbackThreshold,
  hasMemberOrProviderFinalSend,
} from './go-live';
export { parseClientConfigFields, safeParseClientConfigFields, ClientConfigFieldsSchema } from './validate';
export {
  MemoryClientConfigStore,
  getMemoryClientConfigStore,
  resetMemoryClientConfigStore,
} from './store';
export type { ClientConfigStore } from './store';
export { ClientConfigService } from './service';

import { ClientConfigService } from './service';
import { getMemoryClientConfigStore, resetMemoryClientConfigStore } from './store';

let serviceSingleton: ClientConfigService | null = null;

/**
 * Process-local client_config service. Memory-backed in demo / test so
 * Cole does not need AWS credentials. Schema 028 is the RDS path.
 */
export function getClientConfigService(): ClientConfigService {
  if (!serviceSingleton) {
    serviceSingleton = new ClientConfigService(getMemoryClientConfigStore());
  }
  return serviceSingleton;
}

export function resetClientConfigService(): ClientConfigService {
  serviceSingleton = new ClientConfigService(resetMemoryClientConfigStore());
  return serviceSingleton;
}

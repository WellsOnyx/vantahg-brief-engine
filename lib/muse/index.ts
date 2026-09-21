/**
 * Muse Connector Platform (Phase 8 stub).
 *
 * CX / relationship surface only. Clinical SoR stays on the AWS Brief
 * Engine. This barrel does not export a fetch client — live Muse HTTP
 * is intentionally absent.
 */

export {
  MUSE_CONTACT_ROLES,
  MUSE_SCHEDULING_INTENTS,
  type MuseContactRole,
  type MuseSchedulingIntent,
  type MuseSchedulingFlags,
  type MuseRelationshipRecord,
  type MuseTouchpoint,
  type MuseCxEntitlement,
  type MuseConnectorSnapshot,
} from './types';

export {
  MUSE_ALLOWED_FIELDS,
  MUSE_PHI_FIELDS,
  screenMusePayload,
  type MusePhiGateResult,
} from './phi-gate';

export {
  MuseNotConfiguredError,
  museApiKey,
  museWebhookSecrets,
  isMuseCxFlagEnabled,
  readMuseConnector,
  assertMuseConfigured,
  evaluateMuseCxEntitlement,
} from './config';

export { verifyMuseWebhook, type MuseWebhookVerdict } from './webhook';

export {
  MemoryMuseStore,
  getMemoryMuseStore,
  resetMemoryMuseStore,
  type MuseUpsertResult,
} from './store';

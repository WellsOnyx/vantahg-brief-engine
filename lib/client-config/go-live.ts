/**
 * Go-live mode helpers on versioned client_config (Phase 7).
 * Code gates only — not a HIPAA attestation.
 */

import {
  DEFAULT_SLA_MISS_ROLLBACK_THRESHOLD,
  type ClientConfigFields,
  type GoLiveMode,
} from './types';

export function isShadowMode(config?: Pick<ClientConfigFields, 'go_live_mode' | 'shadow_mode'> | null): boolean {
  if (!config) return false;
  return config.shadow_mode === true || config.go_live_mode === 'shadow';
}

export function resolveGoLiveMode(
  config?: Pick<ClientConfigFields, 'go_live_mode' | 'shadow_mode'> | null,
): GoLiveMode {
  if (!config) return 'synthetic';
  if (isShadowMode(config)) return 'shadow';
  return config.go_live_mode ?? 'synthetic';
}

export function resolveSlaMissRollbackThreshold(
  config?: Pick<ClientConfigFields, 'sla_miss_rollback_threshold'> | null,
): number {
  const fromConfig = config?.sla_miss_rollback_threshold;
  if (typeof fromConfig === 'number' && fromConfig >= 0 && fromConfig <= 1) {
    return fromConfig;
  }
  const raw = process.env.SLA_MISS_ROLLBACK_THRESHOLD;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return DEFAULT_SLA_MISS_ROLLBACK_THRESHOLD;
}

export function hasMemberOrProviderFinalSend(
  intents: Array<{ channel: string; status: string; final_send?: boolean }>,
): boolean {
  return intents.some(
    (i) =>
      (i.channel === 'member' || i.channel === 'provider') &&
      (i.status === 'sent' || i.final_send === true),
  );
}

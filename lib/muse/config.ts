/**
 * Muse env slots. Empty means the connector stays dark.
 * No default keys. No network.
 */

import type { MuseConnectorSnapshot, MuseCxEntitlement } from './types';

export class MuseNotConfiguredError extends Error {
  readonly code = 'not_configured' as const;
  readonly status = 503 as const;

  constructor() {
    super('MUSE_API_KEY is not configured');
    this.name = 'MuseNotConfiguredError';
  }
}

function trimmed(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? '';
}

export function museApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return trimmed(env, 'MUSE_API_KEY');
}

export function museWebhookSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = ['MUSE_WEBHOOK_SECRET', 'MUSE_WEBHOOK_SECRET_SECONDARY'] as const;
  const seen = new Set<string>();
  const secrets: string[] = [];
  for (const name of names) {
    const value = trimmed(env, name);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    secrets.push(value);
  }
  return secrets;
}

export function isMuseCxFlagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return trimmed(env, 'MUSE_CX_ENABLED') === 'true';
}

/**
 * Outbound snapshot. A set API key still reports `live_call: false` —
 * this stub does not call muse.ai.
 */
export function readMuseConnector(env: NodeJS.ProcessEnv = process.env): MuseConnectorSnapshot {
  if (!museApiKey(env)) {
    return { configured: false, live_call: false, code: 'not_configured' };
  }
  return { configured: true, live_call: false, code: 'stub_only' };
}

export function assertMuseConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (!readMuseConnector(env).configured) throw new MuseNotConfiguredError();
}

/** CX panel entitlement. Requires the flag and a key. Never a clinical grant. */
export function evaluateMuseCxEntitlement(env: NodeJS.ProcessEnv = process.env): MuseCxEntitlement {
  const configured = Boolean(museApiKey(env));
  const flag_enabled = isMuseCxFlagEnabled(env);
  return {
    configured,
    flag_enabled,
    entitled: configured && flag_enabled,
    live_call: false,
  };
}

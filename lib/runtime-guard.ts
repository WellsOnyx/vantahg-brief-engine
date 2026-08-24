import { isDemoMode } from './demo-mode';

/**
 * Production runtime — including a misconfigured deploy that flipped
 * isDemoMode() true because secrets were empty.
 */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Local/dev demo only. Production demo is NEVER this — that path must
 * fail closed (no admin session, no unsigned webhooks, no cron no-op).
 */
export function isLocalDemoRuntime(): boolean {
  return isDemoMode() && !isProductionRuntime();
}

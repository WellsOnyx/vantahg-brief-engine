/**
 * First-25 live hypercare SLA rollback (02-onboarding Phase E).
 *
 * If miss rate > agreed threshold, pause live intake and stay on shadow.
 * Code gate only — not a HIPAA attestation.
 */

import type { CanonicalCase } from '@/lib/case-spine';
import {
  DEFAULT_SLA_MISS_ROLLBACK_THRESHOLD,
  resolveSlaMissRollbackThreshold,
  type ClientConfigFields,
} from '@/lib/client-config';
import type { LiveHypercareEvaluation } from './types';

export const LIVE_HYPERCARE_SAMPLE = 25;

export function slaMissRate(missed: number, sample: number): number {
  if (sample <= 0) return 0;
  return Math.round((missed / sample) * 10000) / 10000;
}

export function evaluateLiveHypercare(input: {
  client_id: string;
  cases: CanonicalCase[];
  threshold?: number;
  sample_target?: number;
  now?: Date;
  config?: Pick<ClientConfigFields, 'sla_miss_rollback_threshold'> | null;
}): LiveHypercareEvaluation {
  const threshold = input.threshold ?? resolveSlaMissRollbackThreshold(input.config);
  const sampleTarget = input.sample_target ?? LIVE_HYPERCARE_SAMPLE;
  const now = input.now ?? new Date();

  const liveShaped = [...input.cases]
    .filter((c) =>
      ['determined', 'fanout_pending', 'fanout_complete', 'fanout_failed', 'closed'].includes(c.state),
    )
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
    .slice(0, sampleTarget);

  const missed = liveShaped.filter((c) => c.sla_status === 'missed').length;
  const missRate = slaMissRate(missed, liveShaped.length);
  const breached = liveShaped.length > 0 && missRate > threshold;

  return {
    client_id: input.client_id,
    sample_size: liveShaped.length,
    sample_target: sampleTarget,
    missed,
    miss_rate: missRate,
    threshold,
    breached,
    action: breached ? 'rollback_to_shadow' : 'hold',
    note: breached
      ? `SLA miss rate ${missRate} exceeded threshold ${threshold} on first ${liveShaped.length} live-shaped cases. Pause live intake, stay on shadow, root-cause. Code gate only — not a HIPAA attestation.`
      : liveShaped.length === 0
        ? 'No live-shaped cases yet. Hold on synthetic / shadow until E3 starts.'
        : `SLA miss rate ${missRate} at or below threshold ${threshold} (${missed}/${liveShaped.length}). Continue hypercare.`,
    evaluated_at: now.toISOString(),
  };
}

export { DEFAULT_SLA_MISS_ROLLBACK_THRESHOLD };

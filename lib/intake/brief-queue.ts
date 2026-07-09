import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { finalizeIntakeCase, isChannelAgnosticIntakeEnabled } from '@/lib/intake/finalize-case';
import type { IntakeChannel } from '@/lib/types';

/**
 * Brief-generation job queue — the throughput chassis (migration 034).
 *
 * `dispatchFinalization` is the ONE seam every intake route calls in place
 * of `await finalizeIntakeCase(...)`. Its behavior is flag-gated so the
 * change is safe to ship dark:
 *
 *   - ENABLE_BRIEF_QUEUE=true  → enqueue a brief_job and return in ms; the
 *     worker (/api/cron/brief-worker) runs finalizeIntakeCase off the
 *     request path. This is the 11k/day path.
 *   - unset (default)          → previous behavior exactly: run
 *     finalizeIntakeCase inline IFF channel-agnostic intake is enabled.
 *
 * So flipping the flag moves brief generation off the request path with no
 * other code change; leaving it unset preserves today's behavior byte for
 * byte.
 */

export function isBriefQueueEnabled(): boolean {
  return process.env.ENABLE_BRIEF_QUEUE === 'true';
}

/**
 * The seam. Enqueue (queue mode) or run inline (legacy mode). Never throws
 * — a finalization dispatch failure must not fail the caller's 2xx, the
 * case row is already the source of truth.
 */
export async function dispatchFinalization(
  caseId: string,
  opts: { channel?: IntakeChannel; actor?: string; serviceLine?: string } = {},
): Promise<{ mode: 'queued' | 'inline' | 'skipped' }> {
  if (isBriefQueueEnabled()) {
    const enqueued = await enqueueBriefJob(caseId, opts).catch(() => false);
    return { mode: enqueued ? 'queued' : 'skipped' };
  }
  // Legacy path — unchanged: only run inline when channel-agnostic intake is on.
  if (isChannelAgnosticIntakeEnabled()) {
    await finalizeIntakeCase(caseId, { channel: opts.channel, actor: opts.actor });
    return { mode: 'inline' };
  }
  return { mode: 'skipped' };
}

/**
 * Enqueue a brief job. Idempotent: the partial unique index on
 * brief_jobs(case_id) WHERE status IN (pending,processing) makes a
 * duplicate-intake retry a no-op rather than a second brief.
 */
export async function enqueueBriefJob(
  caseId: string,
  opts: { channel?: IntakeChannel; serviceLine?: string } = {},
): Promise<boolean> {
  if (isDemoMode()) return false;
  const supabase = getServiceClient();
  const { error } = await supabase.from('brief_jobs').insert({
    case_id: caseId,
    channel: opts.channel ?? 'unknown',
    service_line: opts.serviceLine ?? null,
    status: 'pending',
    next_attempt_at: new Date().toISOString(),
  });
  if (error) {
    // Unique-violation = already queued/processing → treat as success.
    const dup =
      (error as { code?: string }).code === '23505' ||
      /duplicate key|unique constraint/i.test(error.message ?? '');
    return dup;
  }
  await logAuditEvent(caseId, 'brief_job_enqueued', 'system', {
    channel: opts.channel ?? null,
  }).catch(() => {});
  return true;
}

export interface BriefJobRow {
  id: string;
  case_id: string;
  channel: string;
  attempts: number;
  max_attempts: number;
}

const BACKOFF_MINUTES = [1, 2, 4, 8, 16];

/**
 * Run one job: finalizeIntakeCase (brief + assignment). On failure,
 * decide retry vs dead-letter. `retryable` failures (Anthropic 429/5xx,
 * surfaced by lib/llm as LlmError.retryable) re-enqueue with backoff
 * instead of dropping the brief; non-retryable or exhausted attempts
 * dead-letter with an audited reason.
 */
export async function runBriefJob(job: BriefJobRow): Promise<'done' | 'retry' | 'dead_letter'> {
  const supabase = getServiceClient();
  try {
    await finalizeIntakeCase(job.case_id, { channel: job.channel as IntakeChannel, actor: 'brief-worker' });
    await supabase
      .from('brief_jobs')
      .update({ status: 'done', finished_at: new Date().toISOString(), last_error: null })
      .eq('id', job.id);
    return 'done';
  } catch (err) {
    const retryable = isRetryable(err);
    const exhausted = job.attempts >= job.max_attempts;
    const errName = err instanceof Error ? err.name : 'unknown';

    if (!retryable || exhausted) {
      await supabase
        .from('brief_jobs')
        .update({ status: 'dead_letter', last_error: errName, locked_at: null, locked_by: null })
        .eq('id', job.id);
      await logAuditEvent(job.case_id, 'brief_job_dead_letter', 'system', {
        attempts: job.attempts,
        error_kind: errName,
        reason: retryable ? 'attempts_exhausted' : 'non_retryable',
      }).catch(() => {});
      return 'dead_letter';
    }

    const backoffMin = BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)];
    await supabase
      .from('brief_jobs')
      .update({
        status: 'pending',
        last_error: errName,
        next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', job.id);
    return 'retry';
  }
}

/** True when the error carries the LlmError retryable flag (rate limit / 5xx). */
function isRetryable(err: unknown): boolean {
  if (err && typeof err === 'object' && 'retryable' in err) {
    return (err as { retryable?: boolean }).retryable === true;
  }
  return false;
}

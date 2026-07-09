import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireCronSecret } from '@/lib/env';
import { runBriefJob, type BriefJobRow } from '@/lib/intake/brief-queue';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/brief-worker — drains brief_jobs off the intake request path.
 *
 * Claims a batch via claim_brief_batch (FOR UPDATE SKIP LOCKED — many
 * workers safe; crashed claims self-release after 10 min), runs each job
 * with BOUNDED CONCURRENCY (BRIEF_WORKER_CONCURRENCY, default 4) so a
 * burst doesn't fan out into an unbounded pile of simultaneous Anthropic
 * calls. Retryable failures (429/5xx) re-enqueue with backoff inside
 * runBriefJob; the worker itself just schedules the batch. Bearer
 * CRON_SECRET auth, same as every cron.
 *
 * Scale by raising the cron frequency and/or CONCURRENCY — SKIP LOCKED
 * makes concurrent invocations correct.
 */

const BATCH_SIZE = Number(process.env.BRIEF_WORKER_BATCH_SIZE) || 20;
const CONCURRENCY = Number(process.env.BRIEF_WORKER_CONCURRENCY) || 4;
const TIME_BUDGET_MS = 50_000;

export async function GET(request: NextRequest) {
  try {
    requireCronSecret(request.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({ demo: true, claimed: 0 });
  }

  const started = Date.now();
  const workerId = `brief-worker-${started}`;
  const supabase = getServiceClient();

  const { data: batch, error } = await supabase.rpc('claim_brief_batch', {
    worker_id: workerId,
    batch_size: BATCH_SIZE,
  });
  if (error) {
    return NextResponse.json({ error: 'claim_failed', detail: error.message }, { status: 500 });
  }

  const jobs = (batch ?? []) as BriefJobRow[];
  const counts = { done: 0, retry: 0, dead_letter: 0 };

  // Bounded-concurrency worker pool: CONCURRENCY runners pulling from a
  // shared index, each stopping when the time budget is spent.
  let next = 0;
  async function runner() {
    while (true) {
      if (Date.now() - started > TIME_BUDGET_MS) return;
      const i = next++;
      if (i >= jobs.length) return;
      const outcome = await runBriefJob(jobs[i]);
      counts[outcome] += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, runner));

  return NextResponse.json({ claimed: jobs.length, ...counts });
}

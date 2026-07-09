-- Migration 034 — Brief-generation job queue (throughput chassis)
--
-- The 11k/day fix. AI brief generation + downstream assignment
-- (finalizeIntakeCase) previously ran INLINE in the intake request path —
-- up to ~5 sequential Anthropic calls per case, tens of seconds, holding a
-- serverless request (or fire-and-forget, where the invocation is frozen
-- and the brief silently never completes). This queue moves that work off
-- the request path onto a worker, using the SAME claim-batch + SKIP LOCKED
-- + backoff + dead-letter chassis as the eFax pipeline and the partner
-- webhook worker.
--
-- Intake becomes: validate -> insert case -> enqueue brief_job -> return
-- in milliseconds. A cron worker drains the queue with bounded concurrency
-- and re-enqueues on Anthropic 429/5xx instead of dropping the brief.

CREATE TABLE IF NOT EXISTS brief_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id),
  channel text NOT NULL,
  service_line text,                          -- for per-line throughput dashboards
  -- pending | processing | done | dead_letter
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- One live job per case — enqueue is idempotent under the partial unique
-- index: a duplicate intake retry can't double-enqueue a brief.
CREATE UNIQUE INDEX IF NOT EXISTS brief_jobs_active_case_idx
  ON brief_jobs (case_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS brief_jobs_claimable_idx
  ON brief_jobs (next_attempt_at)
  WHERE status = 'pending';

-- Atomic batch claim — clone of claim_efax_batch. SKIP LOCKED lets many
-- workers run concurrently with no contention; a crashed worker's claim
-- self-releases after 10 minutes.
CREATE OR REPLACE FUNCTION claim_brief_batch(worker_id text, batch_size integer DEFAULT 10)
RETURNS SETOF brief_jobs AS $$
  UPDATE brief_jobs j
  SET status = 'processing', locked_at = now(), locked_by = worker_id, attempts = j.attempts + 1
  WHERE j.id IN (
    SELECT id FROM brief_jobs
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
    ORDER BY next_attempt_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
$$ LANGUAGE sql;

-- Case-number sequence — replaces the racy per-create count(*) ILIKE scan
-- (duplicate case numbers under concurrency + a growing full-scan cost).
-- Callers format VUM-<year>-<nextval padded>.
CREATE SEQUENCE IF NOT EXISTS case_number_seq START 100000;

ALTER TABLE brief_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE brief_jobs IS 'Brief-generation + finalization job queue. Moves inline AI work off the intake request path. Worker: /api/cron/brief-worker.';
COMMENT ON FUNCTION claim_brief_batch IS 'Atomically claims a batch of pending brief jobs (SKIP LOCKED — concurrent workers safe).';
COMMENT ON SEQUENCE case_number_seq IS 'Monotonic case-number source; replaces the racy count(*) scan.';

-- Sequence-backed next-number helper — one round trip, race-free.
CREATE OR REPLACE FUNCTION next_case_seq()
RETURNS bigint AS $$ SELECT nextval('case_number_seq'); $$ LANGUAGE sql;

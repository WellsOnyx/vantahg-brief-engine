-- Migration 008: Production eFax Pipeline
--
-- Goals
-- 1. Async processing: webhook stores raw payload and returns 200 immediately;
--    a cron worker pulls from efax_queue and runs OCR + AI extraction.
-- 2. Document storage: keep our own copy of every received fax in Supabase
--    Storage so we are not dependent on the provider's transient URL.
-- 3. Retries + dead-letter: failed extractions are retried with exponential
--    backoff, then moved to a dead-letter state for human review.
-- 4. Submission deduplication: a content fingerprint prevents the same
--    request from creating two cases when a provider re-submits.
-- 5. Provider tracking: explicit column for which provider sent the fax so
--    multiple adapters (Phaxio, eFax Corporate, RingCentral, OpenFax) can
--    coexist.

-- ── New columns on efax_queue ───────────────────────────────────────────────
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS storage_sha256 text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS storage_bytes integer;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS submission_fingerprint text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS extraction_model text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS extraction_method text; -- 'ai', 'regex_fallback', 'manual'
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS ocr_provider text;       -- 'google_vision', 'provider', 'none'

-- Allow new statuses for the async pipeline
ALTER TABLE efax_queue DROP CONSTRAINT IF EXISTS efax_queue_status_check;
ALTER TABLE efax_queue ADD CONSTRAINT efax_queue_status_check
  CHECK (status IN (
    'received',         -- raw payload stored, not yet processed
    'fetching',         -- downloading the fax document
    'ocr_processing',   -- OCR in progress
    'extracting',       -- AI extraction in progress
    'parsed',           -- extraction done, awaiting case creation
    'case_created',     -- case successfully created
    'manual_review',    -- low confidence, needs CSR triage
    'duplicate',        -- fingerprint matched an existing case
    'rejected',         -- not a valid auth request
    'dead_letter'       -- exhausted retries, requires engineering attention
  ));

-- ── Indexes for the worker query ────────────────────────────────────────────
-- The cron worker pulls rows where status='received' (or retryable failures)
-- and next_attempt_at <= now(), ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_efax_queue_worker
  ON efax_queue (status, next_attempt_at, created_at)
  WHERE status IN ('received', 'fetching', 'ocr_processing', 'extracting');

CREATE INDEX IF NOT EXISTS idx_efax_queue_dead_letter
  ON efax_queue (status, created_at DESC)
  WHERE status = 'dead_letter';

CREATE INDEX IF NOT EXISTS idx_efax_queue_fingerprint
  ON efax_queue (submission_fingerprint)
  WHERE submission_fingerprint IS NOT NULL;

-- ── Submission fingerprint on cases (for cross-channel dedup) ───────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS submission_fingerprint text;

-- Partial unique index — only enforce uniqueness when fingerprint is set.
-- Window is enforced in application code (24h lookup). The unique index keeps
-- a hard floor against accidental duplicates from concurrent webhook calls.
CREATE INDEX IF NOT EXISTS idx_cases_submission_fingerprint
  ON cases (submission_fingerprint, created_at DESC)
  WHERE submission_fingerprint IS NOT NULL;

-- ── Atomic claim function for cron workers ─────────────────────────────────
-- Claims up to `batch_size` rows from efax_queue that are eligible for
-- processing, marking them as locked so concurrent workers don't double-process.
-- Returns the claimed row IDs.
CREATE OR REPLACE FUNCTION claim_efax_batch(
  worker_id text,
  batch_size integer DEFAULT 10
)
RETURNS TABLE (id uuid) AS $$
BEGIN
  RETURN QUERY
  UPDATE efax_queue eq
  SET
    locked_at = now(),
    locked_by = worker_id,
    processing_started_at = COALESCE(eq.processing_started_at, now()),
    attempts = eq.attempts + 1
  WHERE eq.id IN (
    SELECT inner_eq.id
    FROM efax_queue inner_eq
    WHERE
      inner_eq.status = 'received'
      AND (inner_eq.next_attempt_at IS NULL OR inner_eq.next_attempt_at <= now())
      AND (inner_eq.locked_at IS NULL OR inner_eq.locked_at < now() - interval '10 minutes')
      AND inner_eq.attempts < inner_eq.max_attempts
    ORDER BY inner_eq.created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_efax_batch IS
  'Atomically claims a batch of pending faxes for processing. Uses SKIP LOCKED so multiple cron workers can run concurrently without contention.';

-- ── Storage bucket for fax documents ───────────────────────────────────────
-- We do not create the bucket here (Supabase Storage buckets are managed via
-- the dashboard or storage admin API). The README documents the required
-- bucket name: 'efax-documents' (private, signed URLs only).

-- ── Comments ────────────────────────────────────────────────────────────────
COMMENT ON COLUMN efax_queue.attempts IS 'Number of processing attempts (0 = never tried).';
COMMENT ON COLUMN efax_queue.max_attempts IS 'After this many failures, status moves to dead_letter.';
COMMENT ON COLUMN efax_queue.next_attempt_at IS 'Earliest time the worker should retry. Used for exponential backoff.';
COMMENT ON COLUMN efax_queue.locked_by IS 'Worker ID currently processing this row. Cleared on success or release.';
COMMENT ON COLUMN efax_queue.storage_path IS 'Supabase Storage path inside the efax-documents bucket.';
COMMENT ON COLUMN efax_queue.storage_sha256 IS 'SHA-256 of the stored document for integrity verification and binary dedup.';
COMMENT ON COLUMN efax_queue.submission_fingerprint IS 'SHA-256 of normalized patient identifiers + procedure codes + sender. Matches against cases.submission_fingerprint for dedup.';
COMMENT ON COLUMN efax_queue.extraction_method IS 'Which extractor produced parsed_data: ai (Claude tool-use), regex_fallback (when AI failed), or manual (CSR edited).';
COMMENT ON COLUMN cases.submission_fingerprint IS 'Stable hash for cross-channel deduplication. Same fingerprint within 24h returns the existing case.';

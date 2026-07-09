-- Migration 032 — Canonical intake idempotency ledger
--
-- One row per sender-supplied submission_id (Canonical Intake Contract v1,
-- docs/INTAKE_CONTRACT.md §6). The PRIMARY KEY is the idempotency guarantee:
-- two requests carrying the same submission_id can never both create a case,
-- regardless of timing — the second insert loses at the database and the
-- route returns the original outcome with a 409.
--
-- submission_id is an opaque sender-generated id (charset-restricted at the
-- API layer) — never PHI.

CREATE TABLE IF NOT EXISTS intake_submissions (
  submission_id text PRIMARY KEY,
  channel text NOT NULL,
  contract_version text NOT NULL,
  case_id uuid REFERENCES cases(id),
  -- processing | case_created | pended_for_review | duplicate
  status text NOT NULL DEFAULT 'processing',
  sandbox boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS intake_submissions_case_idx
  ON intake_submissions (case_id) WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS intake_submissions_sandbox_idx
  ON intake_submissions (first_seen_at) WHERE sandbox = true;

-- Service-role only: RLS enabled with no policies denies all client-key
-- access; the engine's service client bypasses RLS.
ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE intake_submissions IS 'Idempotency ledger for the Canonical Intake Contract (v1). One row per sender submission_id; PK prevents double-created cases.';
COMMENT ON COLUMN intake_submissions.submission_id IS 'Sender-generated opaque id ([A-Za-z0-9._:-]{8,128}) — retry-stable, never PHI.';
COMMENT ON COLUMN intake_submissions.status IS 'processing | case_created | pended_for_review | duplicate';
COMMENT ON COLUMN intake_submissions.sandbox IS 'true when submitted through the environment-scoped sandbox path (X-GR-Sandbox).';

-- DB-enforced idempotency for the handoff channel (Channel A): the
-- GR-<Idempotency-Key> case-number scheme relied on an application-level
-- pre-check + race re-read. A unique index closes the race at the database,
-- as flagged in the v1 contract's server-side follow-ups.
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_unique
  ON cases (case_number);

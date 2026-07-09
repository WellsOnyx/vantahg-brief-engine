-- Migration 032 (RDS variant) — Canonical intake idempotency ledger
--
-- Identical to supabase/migrations/031_intake_submissions.sql except RLS is
-- omitted: on RDS the app connects as vantaum_admin (service-role pattern,
-- see STATE.md "Application of RLS at the app layer") and no client-key
-- role exists to deny.

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

COMMENT ON TABLE intake_submissions IS 'Idempotency ledger for the Canonical Intake Contract (v1). One row per sender submission_id; PK prevents double-created cases.';

-- DB-enforced idempotency for the handoff channel (Channel A): the
-- GR-<Idempotency-Key> case-number scheme relied on an application-level
-- pre-check + race re-read. A unique index closes the race at the database,
-- as flagged in the v1 contract's server-side follow-ups.
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_unique
  ON cases (case_number);

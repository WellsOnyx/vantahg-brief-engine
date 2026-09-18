-- Migration 029 — Spine briefs + write-once determination packages (Phase 3)
--
-- Source of truth: docs/customer-ready/05-determination-fanout.md,
-- docs/customer-ready/03-auth-workflow-rules.md R13,
-- docs/customer-ready/10-implementation-commits.md Phase 3.
--
-- Memory-backed path in lib/case-spine remains the demo/test SoR.
-- This file is the RDS catalog entry. Plain Postgres 15. No auth.uid().
-- RDS copy: infra-aws/rds-migrations/029_determination_packages.sql (identical).

ALTER TABLE cases ADD COLUMN IF NOT EXISTS signed_rationale text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS determination_package_version int;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS determination_package_key text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fanout_stub jsonb;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS billable_event_stub jsonb;

CREATE TABLE IF NOT EXISTS spine_briefs (
  brief_id uuid PRIMARY KEY,
  case_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('synthetic', 'existing_api')),
  existing_brief_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  draft_determination text NOT NULL CHECK (draft_determination IN ('approve', 'deny', 'pend', 'partial')),
  criteria_result text NOT NULL CHECK (criteria_result IN ('meet', 'fail', 'gray')),
  content jsonb NOT NULL,
  content_hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spine_briefs_case ON spine_briefs(case_id);

CREATE TABLE IF NOT EXISTS determination_packages (
  case_id text NOT NULL,
  version int NOT NULL,
  storage_key text NOT NULL,
  brief_id uuid NOT NULL,
  brief_hash text NOT NULL,
  determination text NOT NULL CHECK (determination IN ('approve', 'deny', 'pend', 'partial')),
  rationale text NOT NULL,
  letter_html text NOT NULL,
  evidence_manifest jsonb NOT NULL,
  signer_id text NOT NULL,
  signed_at timestamptz NOT NULL,
  session_refs jsonb NOT NULL,
  criteria_snapshot jsonb,
  cm_flags text[] NOT NULL DEFAULT '{}',
  fanout_enqueued boolean NOT NULL DEFAULT true,
  billable_event_id text NOT NULL,
  immutable boolean NOT NULL DEFAULT true,
  content_hash text NOT NULL,
  previous_version int,
  PRIMARY KEY (case_id, version),
  CHECK (version >= 1),
  CHECK (previous_version IS NULL OR previous_version = version - 1)
);

CREATE INDEX IF NOT EXISTS idx_determination_packages_signed
  ON determination_packages(signed_at DESC);

ALTER TABLE spine_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE determination_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to spine_briefs" ON spine_briefs;
CREATE POLICY "Allow all access to spine_briefs"
  ON spine_briefs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to determination_packages" ON determination_packages;
CREATE POLICY "Allow all access to determination_packages"
  ON determination_packages FOR ALL USING (true);

COMMENT ON TABLE spine_briefs IS
  'Phase 3 briefs attached to the case spine. Synthetic or existing generate-brief ids. No live PHI.';
COMMENT ON TABLE determination_packages IS
  'Write-once MD sign package (05). Amendments are a new version. Fan-out is Phase 4.';

-- Migration 028 — Versioned client_config (Phase 2.4)
--
-- Source of truth: docs/customer-ready/02-onboarding.md Phase B,
-- docs/customer-ready/10-implementation-commits.md Phase 2.4.
--
-- Append-only. Each publish inserts a new (client_id, version) row.
-- There is no UPDATE/DELETE path in application code. No FK to clients
-- so synthetic staging tenant ids work without a live clients row.
--
-- Plain Postgres 15. No auth.uid(). RDS copy:
-- infra-aws/rds-migrations/028_client_config.sql (identical).

CREATE TABLE IF NOT EXISTS client_config_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id text NOT NULL,
  version int NOT NULL,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  supersedes_version int,
  UNIQUE (client_id, version),
  CHECK (version >= 1),
  CHECK (supersedes_version IS NULL OR supersedes_version = version - 1)
);

CREATE INDEX IF NOT EXISTS idx_client_config_versions_client
  ON client_config_versions(client_id, version DESC);

ALTER TABLE client_config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to client_config_versions" ON client_config_versions;
CREATE POLICY "Allow all access to client_config_versions"
  ON client_config_versions FOR ALL USING (true);

COMMENT ON TABLE client_config_versions IS
  'Immutable client_config history (02 Phase B). Every SLA or route change is a new version + audit event.';

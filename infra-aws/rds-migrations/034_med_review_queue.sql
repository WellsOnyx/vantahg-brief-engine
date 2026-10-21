-- Migration 034 — Med Review queue scale
--
-- Tenant bind on user_profiles plus indexes for client queues,
-- idempotent intake (client_id, external_id), reviewer workload,
-- and SLA scans. Idempotent. Apply with npm run db:migrate:rds.
-- No seed rows. No fee amounts.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS client_id uuid;

CREATE INDEX IF NOT EXISTS idx_user_profiles_client_id
  ON user_profiles (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_client_status_created
  ON cases (client_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_client_external_id
  ON cases (client_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_sla_deadline
  ON cases (turnaround_deadline)
  WHERE turnaround_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_reviewer_open
  ON cases (assigned_reviewer_id, status)
  WHERE assigned_reviewer_id IS NOT NULL;

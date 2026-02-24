-- 002_pipeline_updates.sql
-- Adds 'modify' to determination check constraint and 'credentialing' to reviewer status

-- Drop and re-create determination check constraint to include 'modify'
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_determination_check;
ALTER TABLE cases ADD CONSTRAINT cases_determination_check
  CHECK (determination IS NULL OR determination IN ('approve', 'deny', 'partial_approve', 'pend', 'peer_to_peer_requested', 'modify'));

-- Drop and re-create reviewer status check constraint to include 'credentialing'
ALTER TABLE reviewers DROP CONSTRAINT IF EXISTS reviewers_status_check;
ALTER TABLE reviewers ADD CONSTRAINT reviewers_status_check
  CHECK (status IN ('active', 'inactive', 'on_leave', 'credentialing'));

-- Add delivered status to cases status check if not already present
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;
ALTER TABLE cases ADD CONSTRAINT cases_status_check
  CHECK (status IN ('intake', 'processing', 'brief_ready', 'in_review', 'determination_made', 'delivered', 'closed', 'cancelled'));

-- Index for SLA escalation queries
CREATE INDEX IF NOT EXISTS idx_cases_sla_active
  ON cases (status, turnaround_deadline)
  WHERE status IN ('brief_ready', 'in_review') AND turnaround_deadline IS NOT NULL;

-- Index for audit log de-duplication queries
CREATE INDEX IF NOT EXISTS idx_audit_log_sla_dedup
  ON audit_log (case_id, action, created_at);

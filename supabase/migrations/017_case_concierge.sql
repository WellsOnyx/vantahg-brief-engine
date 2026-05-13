-- Migration 017 - Concierge assignment on cases
--
-- The Concierge UI surfaces "my cases". Cases get routed to a concierge
-- automatically based on the client's active client_concierge_assignment
-- (or manually by a Delivery Lead). This column captures that link.
--
-- Soft pointer: concierges can be deactivated without losing the
-- historical case-concierge link.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS assigned_concierge_id uuid REFERENCES concierges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_assigned_concierge
  ON cases(assigned_concierge_id)
  WHERE assigned_concierge_id IS NOT NULL;

-- Track when a concierge was first assigned (helps with SLA computation
-- since the concierge clock starts here, not at case creation).
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS concierge_assigned_at timestamptz;

COMMENT ON COLUMN cases.assigned_concierge_id IS
  'The concierge owning this case end-to-end. Set via client_concierge_assignments lookup at case creation, can be reassigned by a Delivery Lead.';

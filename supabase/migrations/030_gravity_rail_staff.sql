-- Migration 030 — Gravity Rail per-concierge workspaces
--
-- Each concierge gets their own GR workspace for AI-driven intake and handoff.
-- This enables Gravity Rail as the operator interface for high-volume
-- medical review, IRO/IRE, and IDR cases.
--
-- Populated by provisioner in lib/gravity-rails/provisioner.ts

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS gr_workspace_id text,
  ADD COLUMN IF NOT EXISTS gr_workflow_id integer,
  ADD COLUMN IF NOT EXISTS gr_provisioned_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_gr_workspace_idx
  ON staff (gr_workspace_id) WHERE gr_workspace_id IS NOT NULL;

COMMENT ON COLUMN staff.gr_workspace_id IS 'Gravity Rail workspace UUID for this concierge/operator (per-concierge model for intake/copilot).';
COMMENT ON COLUMN staff.gr_workflow_id IS 'GR workflow ID for "intake → handoff to this concierge" .';
COMMENT ON COLUMN staff.gr_provisioned_at IS 'When the GR workspace was provisioned for this staff member.';

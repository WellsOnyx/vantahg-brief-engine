-- Migration 031 — Gravity Rail staff workspace columns
--
-- Optional per-staff workspace ids written by lib/gravity-rails/provisioner.ts
-- only after Gravity Rail returns a real id. Placeholder ws-<timestamp> ids
-- are refused in code. Empty slots are the expected state until a live key
-- exists outside this repo. Not a live-keyed integration.
--
-- RDS copy: infra-aws/rds-migrations/031_gravity_rail_staff.sql

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS gr_workspace_id text,
  ADD COLUMN IF NOT EXISTS gr_workflow_id integer,
  ADD COLUMN IF NOT EXISTS gr_provisioned_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_gr_workspace_idx
  ON staff (gr_workspace_id) WHERE gr_workspace_id IS NOT NULL;

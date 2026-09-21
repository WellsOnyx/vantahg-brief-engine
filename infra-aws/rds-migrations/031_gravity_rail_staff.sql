-- RDS variant of 031 — Gravity Rail staff workspace columns
--
-- Optional per-staff workspace ids. Provisioner refuses placeholder ids.
-- Not live-keyed. Plain Postgres. No auth.uid().

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS gr_workspace_id text,
  ADD COLUMN IF NOT EXISTS gr_workflow_id integer,
  ADD COLUMN IF NOT EXISTS gr_provisioned_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_gr_workspace_idx
  ON staff (gr_workspace_id) WHERE gr_workspace_id IS NOT NULL;

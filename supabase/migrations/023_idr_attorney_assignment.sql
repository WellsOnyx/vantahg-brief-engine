-- Migration 023 — Add assigned_idr_attorney_id for Payer IDR assignment (Task 5)

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS assigned_idr_attorney_id uuid REFERENCES user_profiles(id);

CREATE INDEX IF NOT EXISTS idx_cases_assigned_idr_attorney_id
  ON cases(assigned_idr_attorney_id)
  WHERE assigned_idr_attorney_id IS NOT NULL;

COMMENT ON COLUMN cases.assigned_idr_attorney_id IS
  'ID of the external IDR Attorney assigned to this Payer IDR case. Only users with role "idr-attorney" should be assigned here.';

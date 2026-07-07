-- RDS mirror of 031 — Extend case_type CHECK for full stream specialization (medical_review, iro, ire)
-- See supabase/migrations/031_extend_case_types_for_streams.sql for rationale.

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_case_type_check;

ALTER TABLE cases
  ADD CONSTRAINT cases_case_type_check
  CHECK (case_type IN ('um', 'payer_idr', 'iro', 'ire', 'medical_review'));

CREATE INDEX IF NOT EXISTS idx_cases_case_type
  ON cases(case_type);

COMMENT ON COLUMN cases.case_type IS
  'Case stream discriminator: um (standard), medical_review (EBM panel), payer_idr (NSA IDR), iro/ire (independent external review).';

UPDATE cases SET case_type = 'um' WHERE case_type IS NULL OR case_type = '';

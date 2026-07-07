-- Migration 031 — Extend case_type CHECK for full stream specialization (medical_review, iro, ire)
-- Required for 333k/yr volume support via shared chassis across um/medical_review/payer_idr/iro/ire.

-- Relax the constraint to include the new specialized stream discriminators.
-- Safe: uses IF EXISTS and adds values that were already in TS and partial runtime paths.

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_case_type_check;

ALTER TABLE cases
  ADD CONSTRAINT cases_case_type_check
  CHECK (case_type IN ('um', 'payer_idr', 'iro', 'ire', 'medical_review'));

-- Ensure index exists (idempotent if prior migrations created it)
CREATE INDEX IF NOT EXISTS idx_cases_case_type
  ON cases(case_type);

COMMENT ON COLUMN cases.case_type IS
  'Case stream discriminator: um (standard), medical_review (EBM panel), payer_idr (NSA IDR), iro/ire (independent external review).';

-- Backfill any legacy nulls (defensive)
UPDATE cases SET case_type = 'um' WHERE case_type IS NULL OR case_type = '';

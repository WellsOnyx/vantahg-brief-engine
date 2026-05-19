-- Migration 021 — Introduce case_type for Payer IDR support
--
-- Adds a top-level case_type discriminator so we can cleanly separate
-- traditional Utilization Management cases ('um') from the new
-- attorney-led Payer IDR workflow ('payer_idr').
--
-- Matches the Supabase migration 021.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS case_type text NOT NULL DEFAULT 'um';

-- Add check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cases_case_type_check'
  ) THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_case_type_check
      CHECK (case_type IN ('um', 'payer_idr'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cases_case_type
  ON cases(case_type);

COMMENT ON COLUMN cases.case_type IS
  'Top-level case classification. "um" = traditional Utilization Management (Concierge workflow). "payer_idr" = attorney-led Payer Independent Dispute Resolution.';

UPDATE cases SET case_type = 'um' WHERE case_type IS NULL;

-- RDS variant of 029
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS case_state text;

COMMENT ON COLUMN cases.case_state IS
  'Jurisdiction/state for the case (for licensure-matched reviewer routing). Real column for prod.';

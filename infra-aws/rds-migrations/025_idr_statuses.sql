-- Migration 025 — IDR-specific statuses

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_status_check;

ALTER TABLE cases
  ADD CONSTRAINT cases_status_check 
  CHECK (status IN (
    'intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 
    'md_review', 'pend_missing_info', 'determination_made', 'delivered',
    'submitted', 'under_attorney_review', 'attorney_determined', 'closed'
  ));

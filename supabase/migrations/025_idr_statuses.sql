-- Migration 025 — IDR-specific statuses

-- Extend the status check constraint to support Payer IDR workflow states.
-- These are in addition to the existing UM statuses.

ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_status_check;

ALTER TABLE cases
  ADD CONSTRAINT cases_status_check 
  CHECK (status IN (
    -- Existing UM statuses
    'intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 
    'md_review', 'pend_missing_info', 'determination_made', 'delivered',
    -- New Payer IDR statuses (Task 8)
    'submitted', 'under_attorney_review', 'attorney_determined', 'closed'
  ));

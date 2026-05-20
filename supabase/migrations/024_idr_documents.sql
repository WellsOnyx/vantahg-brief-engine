-- Migration 024 — Rich document storage for IDR cases (and future use)

-- Add a new jsonb array for structured documents.
-- Each entry: { storage_path, filename, category, bytes, uploaded_by, uploaded_at }
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS documents jsonb[] DEFAULT '{}';

COMMENT ON COLUMN cases.documents IS
  'Structured document list. Each entry contains storage_path, filename, optional category (e.g. denial_letter, claim_form, medical_records), and upload metadata. Used primarily for Payer IDR cases.';

-- Keep the old submitted_documents for backward compatibility with existing flows.

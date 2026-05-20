-- Migration 022 — Add IDR-specific fields to cases table
--
-- These fields are primarily used for Payer IDR (case_type = 'payer_idr')
-- but are nullable so they don't affect existing UM cases.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS billed_amount_cents integer,
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS is_out_of_network boolean;

COMMENT ON COLUMN cases.billed_amount_cents IS 'Billed amount for the claim (in cents). Primarily used for Payer IDR cases.';
COMMENT ON COLUMN cases.denial_reason IS 'Reason given for the denial. Primarily used for Payer IDR cases.';
COMMENT ON COLUMN cases.is_out_of_network IS 'Whether the provider was out-of-network for the claim. Primarily used for Payer IDR cases.';

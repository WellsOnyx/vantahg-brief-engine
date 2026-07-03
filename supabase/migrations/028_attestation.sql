-- Migration 028 — Attestation envelope for determination
--
-- Persists the attestation at determination write time.
-- fields_acknowledged: whether human acknowledged the AI flags / risks / fact-check
-- attested_at: timestamp of the attestation
-- The audit_log 'determination_attested' / 'determination_made' is the product.
-- Column is jsonb for the envelope to keep flexible.
-- Populated when attestation provided on determination.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS attestation jsonb;

COMMENT ON COLUMN cases.attestation IS
  'Attestation envelope at determination time: { flags_acknowledged: bool, attested_at: timestamptz }. Audit log is source of truth. Estimated pending calibration context.';

-- Backfill not applicable for new field.

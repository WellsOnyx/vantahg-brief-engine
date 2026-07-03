-- RDS variant of 028_attestation.sql
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS attestation jsonb;

COMMENT ON COLUMN cases.attestation IS
  'Attestation envelope at determination time: { flags_acknowledged: bool, attested_at: timestamptz }. Audit log is source of truth.';

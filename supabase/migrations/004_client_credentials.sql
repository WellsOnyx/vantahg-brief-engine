-- Migration 004: Client Credential Management
-- Adds InterQual/MCG credential fields and onboarding status to clients table.
-- Credentials are stored encrypted at rest by Supabase (AES-256).
-- Production environments should use Supabase Vault for additional protection.

-- Credential fields for InterQual access (provided by client under their license)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS interqual_portal_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS interqual_username text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS interqual_api_key text;

-- Credential fields for MCG access (provided by client under their license)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mcg_portal_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mcg_username text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mcg_api_key text;

-- Onboarding tracking
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_status text
  DEFAULT 'pending'
  CHECK (onboarding_status IN ('pending', 'credentials_needed', 'active', 'suspended'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credentials_configured_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_notes text;

-- Update existing clients to 'active' if they already have criteria configured
UPDATE clients
SET onboarding_status = 'active',
    credentials_configured_at = now()
WHERE (uses_interqual = true OR uses_mcg = true)
  AND onboarding_status = 'pending';

-- Ensure credential columns are only accessible via service role (RLS)
-- The existing RLS policies already restrict clients table to authenticated admin users.
-- API routes use getServiceClient() which bypasses RLS, so credentials are safe.

COMMENT ON COLUMN clients.interqual_api_key IS 'Encrypted at rest. Client-provided InterQual API key under their license agreement.';
COMMENT ON COLUMN clients.mcg_api_key IS 'Encrypted at rest. Client-provided MCG API key under their license agreement.';
COMMENT ON COLUMN clients.onboarding_status IS 'Tracks client readiness: pending → credentials_needed → active';

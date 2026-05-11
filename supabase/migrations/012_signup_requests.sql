-- Migration 012 — TPA self-serve signup requests
--
-- Captures prospects submitting the public signup form. Status flows
-- through pending_review → approved → signed → live. Admin review
-- happens at /admin/signups. On approve the bootstrap-real-client
-- logic creates the matching clients + reviewers rows and links them
-- back here via client_id.
--
-- No PHI is captured at signup time — only business contact info +
-- estimated volume / rate. The BAA is a precondition for tenant
-- creation (enforced by admin review before approve), so the moment
-- client_id is populated, a signed BAA must exist as either an
-- uploaded contract or a DocuSign-completed envelope.

CREATE TABLE IF NOT EXISTS signup_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Status flow
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'signed', 'live')),

  -- Company
  legal_name text NOT NULL,
  dba text,
  entity_state text,         -- state of incorporation
  street_address text,
  city text,
  state text,
  zip text,

  -- Primary operations contact
  primary_contact_name text NOT NULL,
  primary_contact_title text,
  primary_contact_email text NOT NULL,
  primary_contact_phone text,

  -- Contract signer (may differ from primary contact)
  signer_name text,
  signer_title text,
  signer_email text,

  -- Deal economics
  estimated_members integer CHECK (estimated_members IS NULL OR estimated_members >= 0),
  pepm_rate_cents integer CHECK (pepm_rate_cents IS NULL OR pepm_rate_cents >= 0),
  expected_weekly_auths integer CHECK (expected_weekly_auths IS NULL OR expected_weekly_auths >= 0),

  -- Context
  existing_tpa_system text,   -- free-text or known dropdown value
  notes text,

  -- Admin review trail
  reviewed_by text,           -- email of admin who reviewed (matches user_profiles → auth.users.email)
  reviewed_at timestamptz,
  rejection_reason text,

  -- Signed contract (manual upload path for Phase 1.0)
  contract_storage_path text, -- Supabase Storage path
  contract_uploaded_at timestamptz,
  contract_uploaded_by text,  -- email

  -- Tenant linkage (set after approve creates the clients row)
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by text            -- email
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status
  ON signup_requests(status);
CREATE INDEX IF NOT EXISTS idx_signup_requests_created_at
  ON signup_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_requests_client_id
  ON signup_requests(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signup_requests_email
  ON signup_requests(primary_contact_email);

-- updated_at maintenance trigger
CREATE OR REPLACE FUNCTION set_signup_requests_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signup_requests_set_updated_at ON signup_requests;
CREATE TRIGGER signup_requests_set_updated_at
  BEFORE UPDATE ON signup_requests
  FOR EACH ROW EXECUTE FUNCTION set_signup_requests_updated_at();

-- RLS — public-facing INSERTs happen via /api/signup-tpa which uses the
-- service-role client (bypasses RLS, validated server-side). Reads and
-- updates restricted to internal staff via the policy below.
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff full access to signup_requests" ON signup_requests;
CREATE POLICY "Internal staff full access to signup_requests"
  ON signup_requests FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt'));

COMMENT ON TABLE signup_requests IS
  'TPA self-serve signup submissions. Status flow: pending_review → approved/rejected → signed → live. Tenant creation happens on approve and links via client_id. BAA must exist (uploaded or DocuSign-completed) before approve.';
COMMENT ON COLUMN signup_requests.pepm_rate_cents IS
  'PEPM rate in cents to avoid float-comparison issues (e.g. $2.40 = 240).';
COMMENT ON COLUMN signup_requests.contract_storage_path IS
  'Path in Supabase Storage (Phase 1.0 manual upload). Replaced by DocuSign envelope ID in Phase 1.1.';

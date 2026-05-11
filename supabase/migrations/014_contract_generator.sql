-- Migration 014 — Contract generator (Phase 2.0)
--
-- Two tables:
--   contract_templates: append-only definitions of the contract types we
--     generate (MSA-with-BAA, addenda, etc.). Each row snapshots the
--     template body + variable schema at the time the version was
--     activated, so contracts generated against version N are immune to
--     later edits to that template.
--   contracts: instances generated from a template, linked back to the
--     originating signup_request (and later, client). Tracks the lifecycle
--     draft → generated → sent → partially_signed → signed → void and
--     stores both the unsigned-rendered PDF path and (after the e-sign
--     callback) the executed PDF path.
--
-- The HelloSign envelope ID lives on `contracts.hellosign_signature_request_id`
-- so the webhook handler (piece E of Phase 2.1) can join from envelope ID
-- back to our row without a separate mapping table.

CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,

  slug text NOT NULL,                -- 'msa-with-baa'
  version text NOT NULL,             -- 'v1' (semantic versioning for the template body)
  title text NOT NULL,               -- 'VantaUM Master Services Agreement (incl. BAA)'
  active boolean NOT NULL DEFAULT true,

  -- The full template body as authored. Stored even though the canonical
  -- copy is in the source tree, so historical contracts can be
  -- re-rendered from DB without depending on the deployed build.
  body_md text NOT NULL,

  -- Variable schema: array of { key, label, source, signupField?, format, required, defaultValue? }
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Signer roles: array of { key, label }
  --   e.g. [{key:'tpa_signer', label:'TPA Authorized Signer'},
  --         {key:'vantaum_signer', label:'VantaUM Authorized Signer'}]
  signer_roles jsonb NOT NULL DEFAULT '[]'::jsonb,

  UNIQUE(slug, version)
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_slug_active
  ON contract_templates(slug)
  WHERE active;

COMMENT ON TABLE contract_templates IS
  'Append-only contract template versions. The body_md snapshot is what was active when the version was published; do not edit rows in place — publish a new version.';


CREATE TABLE IF NOT EXISTS contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  template_id uuid NOT NULL REFERENCES contract_templates(id),
  signup_id uuid REFERENCES signup_requests(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'sent', 'partially_signed', 'signed', 'void')),

  -- The substituted variable values used to render. Stored so the
  -- contract is reproducible even if signup_requests is edited later.
  variable_values jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Storage paths inside the existing signup-contracts bucket (or a
  -- future contracts bucket — kept generic on purpose).
  rendered_pdf_path text,            -- unsigned generated PDF
  executed_pdf_path text,            -- fully-signed PDF (after HelloSign callback)

  -- E-sign integration (Phase 2.1)
  hellosign_signature_request_id text,

  -- Lifecycle timestamps
  generated_at timestamptz,
  sent_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,
  void_reason text,

  created_by text                    -- email of the admin who hit "generate"
);

CREATE INDEX IF NOT EXISTS idx_contracts_signup_id
  ON contracts(signup_id)
  WHERE signup_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_client_id
  ON contracts(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_hellosign
  ON contracts(hellosign_signature_request_id)
  WHERE hellosign_signature_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_created_at
  ON contracts(created_at DESC);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION set_contracts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_set_updated_at ON contracts;
CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_contracts_updated_at();

COMMENT ON TABLE contracts IS
  'Generated contract instances. Links a contract_template to a signup_request and (eventually) a client. The variable_values jsonb is the audit-trail record of what was substituted in to render the PDF.';

-- RLS — internal-staff-only. API routes use service-role; this policy
-- gates any future browser-direct access to the same roles allowed on
-- signup_requests.
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff read contract_templates" ON contract_templates;
CREATE POLICY "Internal staff read contract_templates"
  ON contract_templates FOR SELECT
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt'));

DROP POLICY IF EXISTS "Internal staff full access to contracts" ON contracts;
CREATE POLICY "Internal staff full access to contracts"
  ON contracts FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt'));

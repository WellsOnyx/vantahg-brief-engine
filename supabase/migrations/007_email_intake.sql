-- Migration 007: Email Intake Queue
-- Adds: email_queue table for processing inbound auth requests via email,
-- allowed_sender_domains whitelist, updated_at trigger, and indexes/RLS.

-- ── Email Queue ─────────────────────────────────────────────────────────────
-- Stores incoming emails awaiting parsing and case creation.
-- Mirrors efax_queue pattern but captures email-specific metadata
-- (sender, subject, HTML body, attachments).
CREATE TABLE IF NOT EXISTS email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Email metadata
  email_id text UNIQUE,              -- Provider unique email ID (e.g. SendGrid msg ID)
  from_address text NOT NULL,        -- Sender email address
  from_name text,                    -- Parsed sender display name
  to_address text,                   -- Receiving inbox address
  subject text,

  -- Content
  body_text text,                    -- Plain text body (stripped of signatures/noise)
  body_html text,                    -- Original HTML for fallback rendering

  -- Attachments
  attachment_count integer DEFAULT 0,
  attachment_types text[],           -- Array of file extensions, e.g. {'pdf','jpg'}
  attachment_urls jsonb,             -- Array of {filename, url, content_type, size}
  has_clinical_documents boolean DEFAULT false,

  -- Parsed clinical data
  parsed_data jsonb,                 -- Full ParsedEmailData object from AI extraction
  confidence_score integer DEFAULT 0,

  -- Processing status
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN (
      'received',        -- Just arrived, not yet touched
      'processing',      -- AI extraction in progress
      'parsed',          -- Parsed successfully, awaiting case creation
      'case_created',    -- Case created, fully processed
      'manual_review',   -- Flagged for human review
      'rejected',        -- Not a valid auth request
      'duplicate'        -- Duplicate of existing submission
    )),
  needs_manual_review boolean NOT NULL DEFAULT false,
  manual_review_reasons text[],      -- Why it was flagged, e.g. {'low_confidence','missing_patient'}

  -- Link to created case
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  authorization_number text,

  -- Email classification
  email_type text DEFAULT 'auth_request'
    CHECK (email_type IN (
      'auth_request',    -- Prior authorization request
      'clinical_docs',   -- Supporting clinical documents
      'status_inquiry',  -- Checking status of existing case
      'appeal',          -- Appeal of a determination
      'general'          -- General correspondence
    )),

  -- Processing metadata
  processed_at timestamptz,
  processed_by uuid,                 -- Staff user who processed / reviewed

  -- Sender trust
  sender_verified boolean DEFAULT false
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS email_queue_status_idx
  ON email_queue(status);

CREATE INDEX IF NOT EXISTS email_queue_from_idx
  ON email_queue(from_address);

CREATE INDEX IF NOT EXISTS email_queue_created_idx
  ON email_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS email_queue_case_idx
  ON email_queue(case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_queue_review_idx
  ON email_queue(needs_manual_review)
  WHERE needs_manual_review = true;

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Service role (used by API routes) can do everything
CREATE POLICY IF NOT EXISTS email_queue_service_all ON email_queue
  FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users with admin or reviewer role can read
CREATE POLICY IF NOT EXISTS email_queue_staff_select ON email_queue
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      auth.jwt() ->> 'user_role' IN ('admin', 'reviewer')
    )
  );

-- ── Updated_at Trigger ──────────────────────────────────────────────────────
-- Reuses the update_updated_at() function from migration 000
CREATE TRIGGER email_queue_updated_at
  BEFORE UPDATE ON email_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── intake_log Channel Constraint ───────────────────────────────────────────
-- The existing intake_log.channel CHECK already includes 'email'
-- (see migration 006, line: CHECK (channel IN ('portal','efax','email','phone','api','batch_upload')))
-- No alteration needed.

-- ── Allowed Sender Domains (Whitelist) ──────────────────────────────────────
-- Optional lookup table so the system can auto-verify senders whose
-- domain matches a known client. Unverified senders are flagged for
-- manual review instead of being silently dropped.
CREATE TABLE IF NOT EXISTS allowed_sender_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,       -- e.g. 'suncoastortho.com'
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  notes text
);

-- Index for fast domain lookups during inbound processing
CREATE INDEX IF NOT EXISTS allowed_sender_domains_domain_idx
  ON allowed_sender_domains(domain);

-- RLS for allowed_sender_domains
ALTER TABLE allowed_sender_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS allowed_sender_domains_service_all ON allowed_sender_domains
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS allowed_sender_domains_staff_select ON allowed_sender_domains
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      auth.jwt() ->> 'user_role' IN ('admin', 'reviewer')
    )
  );

-- ── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE email_queue IS 'Queue for inbound emails awaiting AI parsing and case creation. No raw PHI in metadata columns.';
COMMENT ON TABLE allowed_sender_domains IS 'Whitelist of trusted sender domains mapped to clients for auto-verification.';
COMMENT ON COLUMN email_queue.parsed_data IS 'Structured clinical data extracted by AI — patient, provider, procedure codes, etc.';
COMMENT ON COLUMN email_queue.confidence_score IS 'AI extraction confidence 0-100. Below threshold triggers manual_review.';
COMMENT ON COLUMN email_queue.attachment_urls IS 'JSON array of {filename, url, content_type, size} for each attachment.';
COMMENT ON COLUMN email_queue.manual_review_reasons IS 'Array of reasons the email was flagged, e.g. low_confidence, missing_patient, unknown_sender.';
COMMENT ON COLUMN allowed_sender_domains.domain IS 'Email domain to whitelist, e.g. suncoastortho.com. Matched against from_address.';

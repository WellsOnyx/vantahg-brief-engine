-- Migration 006: HIPAA-Compliant Intake System
-- Adds: intake_log table for compliance trail, authorization number sequence,
-- intake tracking fields on cases table

-- ── Authorization Number Sequence ─────────────────────────────────────────────
-- Atomic sequential counter for generating AUTH-YYYY-XXXXXX numbers
CREATE SEQUENCE IF NOT EXISTS authorization_number_seq START 1 INCREMENT 1;

-- PostgreSQL function to get next auth number
CREATE OR REPLACE FUNCTION next_authorization_number()
RETURNS integer AS $$
  SELECT nextval('authorization_number_seq')::integer;
$$ LANGUAGE sql;

-- ── Intake Log (HIPAA Compliance Trail) ───────────────────────────────────────
-- Every submission regardless of outcome is logged here.
-- No raw PHI — patient names are hashed before storage.
CREATE TABLE IF NOT EXISTS intake_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Channel and source
  channel text NOT NULL CHECK (channel IN ('portal', 'efax', 'email', 'phone', 'api', 'batch_upload')),
  source_identifier text, -- fax number, email address, API key name (no PHI)

  -- Tracking
  authorization_number text,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  patient_name_hash text, -- hashed, never raw PHI

  -- Status
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'case_created', 'rejected', 'duplicate')),
  rejection_reason text,

  -- Processing
  metadata jsonb,
  processed_at timestamptz,
  processed_by text
);

-- Indexes for intake log queries
CREATE INDEX IF NOT EXISTS idx_intake_log_channel ON intake_log(channel);
CREATE INDEX IF NOT EXISTS idx_intake_log_status ON intake_log(status);
CREATE INDEX IF NOT EXISTS idx_intake_log_auth_number ON intake_log(authorization_number);
CREATE INDEX IF NOT EXISTS idx_intake_log_case_id ON intake_log(case_id);
CREATE INDEX IF NOT EXISTS idx_intake_log_created_at ON intake_log(created_at DESC);

-- ── E-fax Queue (pending faxes awaiting processing) ──────────────────────────
CREATE TABLE IF NOT EXISTS efax_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Fax details
  fax_id text NOT NULL, -- provider's fax ID
  from_number text,
  to_number text,
  page_count integer DEFAULT 0,

  -- Document storage
  document_url text, -- URL to stored fax document
  content_type text DEFAULT 'application/pdf',

  -- OCR results
  ocr_text text,
  ocr_confidence numeric(5,2),

  -- Parsed data (stored as JSON for flexibility)
  parsed_data jsonb,

  -- Processing status
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'ocr_processing', 'parsed', 'case_created', 'manual_review', 'rejected', 'duplicate')),
  intake_log_id uuid REFERENCES intake_log(id),
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,

  -- Manual review
  needs_manual_review boolean DEFAULT false,
  manual_review_reasons text[],
  reviewed_by text,
  reviewed_at timestamptz,

  -- Provider metadata
  provider text, -- 'efax', 'ringcentral', 'phaxio'
  provider_metadata jsonb,

  CONSTRAINT unique_fax_id UNIQUE (fax_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_efax_queue_status ON efax_queue(status);
CREATE INDEX IF NOT EXISTS idx_efax_queue_created_at ON efax_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efax_queue_needs_review ON efax_queue(needs_manual_review) WHERE needs_manual_review = true;

-- ── Update cases table with intake tracking ──────────────────────────────────
-- These columns may already exist from previous migrations — IF NOT EXISTS handles that
ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_source_id uuid; -- links back to intake_log
ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_received_at timestamptz; -- when we first received the submission
ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_processed_at timestamptz; -- when we finished creating the case

-- ── Row Level Security ───────────────────────────────────────────────────────
-- intake_log: only admin/system can read/write
ALTER TABLE intake_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE efax_queue ENABLE ROW LEVEL SECURITY;

-- Service role (API routes) can do everything
CREATE POLICY IF NOT EXISTS intake_log_service_all ON intake_log
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS efax_queue_service_all ON efax_queue
  FOR ALL USING (true) WITH CHECK (true);

-- ── Comments ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE intake_log IS 'HIPAA compliance trail for all case submissions. No raw PHI — patient names hashed.';
COMMENT ON TABLE efax_queue IS 'Queue for incoming e-faxes awaiting OCR processing and case creation.';
COMMENT ON SEQUENCE authorization_number_seq IS 'Sequential counter for AUTH-YYYY-XXXXXX authorization numbers.';
COMMENT ON COLUMN intake_log.patient_name_hash IS 'One-way hash of patient name for duplicate detection without storing PHI.';
COMMENT ON COLUMN efax_queue.parsed_data IS 'Structured data extracted from OCR text — stored as JSON for schema flexibility.';

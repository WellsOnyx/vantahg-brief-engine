-- Migration 033 — IRO portal records on the existing vantaum RDS.
--
-- No new AWS account, VPC, bucket, or KMS key. Case JSON and the audit
-- trail live in this database (storageEncrypted on the existing instance).
-- Document bytes stay in the existing efax-documents bucket
-- (vantaum-<env>-efax-documents): SSE-KMS via the bucket default key,
-- block-public, TLS-only. Keys are iro/<case_id>/<id>.pdf.

CREATE TABLE IF NOT EXISTS iro_cases (
  id text PRIMARY KEY,
  company text NOT NULL DEFAULT 'VANTA_HG',
  line_of_business text NOT NULL DEFAULT 'IRO',
  state_code text NOT NULL,
  step text NOT NULL,
  status text NOT NULL,
  synthetic boolean NOT NULL DEFAULT false,
  reviewer_id text,
  deadline_due_at timestamptz,
  body jsonb NOT NULL,
  storage_objects jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iro_cases_company_check CHECK (company = 'VANTA_HG'),
  CONSTRAINT iro_cases_line_check CHECK (line_of_business = 'IRO')
);

CREATE INDEX IF NOT EXISTS iro_cases_step_idx ON iro_cases (step, updated_at DESC);
CREATE INDEX IF NOT EXISTS iro_cases_reviewer_idx ON iro_cases (reviewer_id);

CREATE TABLE IF NOT EXISTS iro_case_audit (
  id bigserial PRIMARY KEY,
  case_id text NOT NULL REFERENCES iro_cases (id),
  at timestamptz NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  code text NOT NULL,
  step text NOT NULL,
  version integer NOT NULL,
  request_id text
);

CREATE INDEX IF NOT EXISTS iro_case_audit_case_idx ON iro_case_audit (case_id, id);

CREATE TABLE IF NOT EXISTS iro_case_documents (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES iro_cases (id),
  storage_key text NOT NULL,
  bucket text NOT NULL DEFAULT 'efax-documents',
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iro_case_documents_bucket_check CHECK (bucket = 'efax-documents'),
  CONSTRAINT iro_case_documents_key_prefix CHECK (storage_key LIKE 'iro/%')
);

CREATE INDEX IF NOT EXISTS iro_case_documents_case_idx ON iro_case_documents (case_id);

-- One shared credentialing document. The shape is lib/credentialing state.
-- License numbers are not part of that shape.
CREATE TABLE IF NOT EXISTS iro_credentialing_state (
  id text PRIMARY KEY,
  body jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iro_staff_grants (
  user_id text PRIMARY KEY,
  portal_role text,
  clearance_role text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iro_staff_grants_portal_role_check CHECK (
    portal_role IS NULL OR portal_role IN ('intake', 'case_manager', 'reviewer', 'approver', 'admin')
  )
);

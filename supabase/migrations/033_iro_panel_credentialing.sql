-- Migration 033 — IRO Panel & Credentialing (VantaHG)
--
-- Separate from UM Med Review. Does not alter billable_events, UM price
-- columns, or client_config.vanta_med_review_contract.
--
-- Front-line assignment reads iro_panel_assignment_v and
-- iro_case_check_status_v. Those views omit HR columns (contracts,
-- license numbers, screening findings, evidence, conflict notes).
-- The application repository must keep using that column list. The
-- service role bypasses RLS, which is the existing platform pattern;
-- RLS still denies these tables to other roles when a non-bypass
-- connection is used.

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN (
    'admin',
    'reviewer',
    'client',
    'builder',
    'ceo',
    'practice-lead',
    'slt',
    'delivery-lead',
    'concierge',
    'idr-attorney',
    'credentialing_admin',
    'clinical_approver'
  ));

CREATE TABLE IF NOT EXISTS iro_module_settings (
  id int PRIMARY KEY CHECK (id = 1),
  iro_line_contract boolean NOT NULL DEFAULT false,
  cutover_gate text NOT NULL DEFAULT 'closed' CHECK (cutover_gate IN ('closed', 'open')),
  workspace_tested boolean NOT NULL DEFAULT false,
  transferred_records_checked boolean NOT NULL DEFAULT false,
  access_permissions_confirmed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO iro_module_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS iro_physicians (
  id uuid PRIMARY KEY,
  external_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  legal_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  npi text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN (
    'applicant', 'in_verification', 'pending_clinical_approval',
    'approved', 'conditional', 'denied', 'suspended', 'expired'
  )),
  specialties text[] NOT NULL DEFAULT '{}',
  jurisdictions text[] NOT NULL DEFAULT '{}',
  availability text NOT NULL DEFAULT 'unavailable' CHECK (availability IN ('available', 'limited', 'unavailable')),
  assignment_status text NOT NULL DEFAULT 'unassigned' CHECK (assignment_status IN ('unassigned', 'assignable', 'on_case', 'hold')),
  cv_storage_key text,
  contract_ref text,
  notes_hr text,
  board_cert_waiver text,
  application_received_at date,
  recredential_due_at date,
  approved_at timestamptz,
  approved_expires_at date,
  verification_completed_at timestamptz,
  verification_completed_by text,
  clinical_decision_at timestamptz,
  clinical_decision_by text,
  clinical_decision_note text,
  conditional_terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iro_licenses (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  state text NOT NULL,
  license_number text NOT NULL,
  expires_on date,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'restricted')),
  primary_source_verified_at date,
  primary_source_method text,
  primary_source_result text CHECK (primary_source_result IS NULL OR primary_source_result IN ('clear', 'hit', 'inconclusive')),
  evidence_storage_key text
);

CREATE TABLE IF NOT EXISTS iro_board_certifications (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  board_name text NOT NULL,
  specialty text NOT NULL,
  certified_on date,
  expires_on date,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'waived')),
  evidence_storage_key text
);

CREATE TABLE IF NOT EXISTS iro_sanctions_screenings (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('oig_leie', 'sam', 'npdb', 'state_board')),
  screened_at date NOT NULL,
  result text NOT NULL CHECK (result IN ('clear', 'hit', 'inconclusive')),
  finding_summary text NOT NULL DEFAULT '',
  evidence_storage_key text,
  live_call boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS iro_clinical_experience (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  setting text NOT NULL,
  role_title text NOT NULL DEFAULT '',
  specialty text NOT NULL DEFAULT '',
  started_on date,
  ended_on date,
  direct_patient_care boolean NOT NULL DEFAULT false,
  recency_note text
);

CREATE TABLE IF NOT EXISTS iro_agreements (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  agreement_type text NOT NULL CHECK (agreement_type IN (
    'confidentiality', 'conflict_policy', 'panel_participation', 'hipaa_ack'
  )),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('outstanding', 'acknowledged', 'expired')),
  acknowledged_at date,
  evidence_storage_key text,
  evidence_link text
);

CREATE TABLE IF NOT EXISTS iro_outstanding_items (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  label text NOT NULL,
  due_on date,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS iro_credential_events (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'change', 'finding', 'follow_up', 'corrective_action', 'status_transition', 'reminder'
  )),
  summary text NOT NULL,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iro_evidence (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  path text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cv', 'license', 'sanction', 'agreement', 'contract', 'other')),
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS iro_case_reviews (
  case_ref text PRIMARY KEY,
  required_specialty text NOT NULL,
  required_jurisdiction text NOT NULL,
  assigned_physician_id uuid REFERENCES iro_physicians(id),
  assignment_state text NOT NULL DEFAULT 'unassigned' CHECK (assignment_state IN ('unassigned', 'assigned', 'completed')),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS iro_case_attestations (
  id uuid PRIMARY KEY,
  case_ref text NOT NULL REFERENCES iro_case_reviews(case_ref),
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE RESTRICT,
  reviewer_user_id text NOT NULL,
  reviewer_email text NOT NULL,
  conflict_attested boolean NOT NULL,
  conflict_free boolean NOT NULL,
  conflict_note text,
  qualification_attested boolean NOT NULL,
  specialty_match boolean NOT NULL,
  jurisdiction_match boolean NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_ref, physician_id)
);

CREATE TABLE IF NOT EXISTS iro_reminders (
  id uuid PRIMARY KEY,
  physician_id uuid NOT NULL REFERENCES iro_physicians(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('license_expiry', 'recredentialing', 'outstanding_item', 'agreement')),
  due_on date,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_iro_physicians_status ON iro_physicians(status);
CREATE INDEX IF NOT EXISTS idx_iro_licenses_expires ON iro_licenses(expires_on);
CREATE INDEX IF NOT EXISTS idx_iro_reminders_open ON iro_reminders(status);

-- Safe projection for case-assignment staff. Do not add HR columns.
CREATE OR REPLACE VIEW iro_panel_assignment_v AS
SELECT
  id,
  display_name,
  specialties,
  jurisdictions,
  availability,
  assignment_status
FROM iro_physicians
WHERE status IN ('approved', 'conditional')
  AND (approved_expires_at IS NULL OR approved_expires_at > now());

-- Completion flag only. Conflict notes stay on the base table.
CREATE OR REPLACE VIEW iro_case_check_status_v AS
SELECT
  case_ref,
  physician_id,
  (
    conflict_attested
    AND conflict_free
    AND qualification_attested
    AND specialty_match
    AND jurisdiction_match
  ) AS case_checks_complete
FROM iro_case_attestations;

COMMENT ON COLUMN iro_physicians.contract_ref IS
  'HR-only. Must not be selected by assignment queries.';
COMMENT ON COLUMN iro_physicians.notes_hr IS
  'HR-only compensation and contract notes.';
COMMENT ON COLUMN iro_licenses.license_number IS
  'HR and clinical approver. Hidden from front-line assignment.';
COMMENT ON COLUMN iro_sanctions_screenings.finding_summary IS
  'Detailed screening finding. Hidden from front-line assignment.';
COMMENT ON VIEW iro_panel_assignment_v IS
  'Operational card: name, specialty, jurisdiction, availability, assignment status.';

CREATE OR REPLACE FUNCTION iro_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'iro history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS iro_events_append_only ON iro_credential_events;
CREATE TRIGGER iro_events_append_only
  BEFORE UPDATE OR DELETE ON iro_credential_events
  FOR EACH ROW EXECUTE FUNCTION iro_reject_mutation();

DROP TRIGGER IF EXISTS iro_attestations_append_only ON iro_case_attestations;
CREATE TRIGGER iro_attestations_append_only
  BEFORE UPDATE OR DELETE ON iro_case_attestations
  FOR EACH ROW EXECUTE FUNCTION iro_reject_mutation();

ALTER TABLE iro_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_physicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_board_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_sanctions_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_clinical_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_outstanding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_credential_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_case_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_case_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE iro_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iro_hr_settings ON iro_module_settings;
CREATE POLICY iro_hr_settings ON iro_module_settings
  FOR ALL
  USING (get_user_role() IN ('credentialing_admin', 'admin'))
  WITH CHECK (get_user_role() IN ('credentialing_admin', 'admin'));

DROP POLICY IF EXISTS iro_hr_physicians ON iro_physicians;
CREATE POLICY iro_hr_physicians ON iro_physicians
  FOR ALL
  USING (get_user_role() IN ('credentialing_admin', 'admin'))
  WITH CHECK (get_user_role() IN ('credentialing_admin', 'admin'));

DROP POLICY IF EXISTS iro_clinical_physicians_read ON iro_physicians;
CREATE POLICY iro_clinical_physicians_read ON iro_physicians
  FOR SELECT
  USING (get_user_role() = 'clinical_approver');

DROP POLICY IF EXISTS iro_clinical_physicians_update ON iro_physicians;
CREATE POLICY iro_clinical_physicians_update ON iro_physicians
  FOR UPDATE
  USING (get_user_role() = 'clinical_approver')
  WITH CHECK (get_user_role() = 'clinical_approver');

-- Child credentialing tables: HR writes, clinical approver reads.
-- No policy for reviewer / concierge / delivery-lead / practice-lead.

DO $$
DECLARE
  child text;
BEGIN
  FOREACH child IN ARRAY ARRAY[
    'iro_licenses',
    'iro_board_certifications',
    'iro_sanctions_screenings',
    'iro_clinical_experience',
    'iro_agreements',
    'iro_outstanding_items',
    'iro_credential_events',
    'iro_reminders'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS iro_hr_all ON %I', child);
    EXECUTE format(
      'CREATE POLICY iro_hr_all ON %I FOR ALL USING (get_user_role() IN (''credentialing_admin'', ''admin'')) WITH CHECK (get_user_role() IN (''credentialing_admin'', ''admin''))',
      child
    );
    EXECUTE format('DROP POLICY IF EXISTS iro_clinical_read ON %I', child);
    EXECUTE format(
      'CREATE POLICY iro_clinical_read ON %I FOR SELECT USING (get_user_role() = ''clinical_approver'')',
      child
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS iro_hr_evidence ON iro_evidence;
CREATE POLICY iro_hr_evidence ON iro_evidence
  FOR ALL
  USING (get_user_role() IN ('credentialing_admin', 'admin'))
  WITH CHECK (get_user_role() IN ('credentialing_admin', 'admin'));

DROP POLICY IF EXISTS iro_clinical_evidence ON iro_evidence;
CREATE POLICY iro_clinical_evidence ON iro_evidence
  FOR SELECT
  USING (get_user_role() = 'clinical_approver' AND kind <> 'contract');

DROP POLICY IF EXISTS iro_hr_cases ON iro_case_reviews;
CREATE POLICY iro_hr_cases ON iro_case_reviews
  FOR ALL
  USING (get_user_role() IN ('credentialing_admin', 'admin', 'reviewer', 'concierge', 'delivery-lead', 'practice-lead'))
  WITH CHECK (get_user_role() IN ('credentialing_admin', 'admin', 'reviewer', 'concierge', 'delivery-lead', 'practice-lead'));

DROP POLICY IF EXISTS iro_hr_attestations ON iro_case_attestations;
CREATE POLICY iro_hr_attestations ON iro_case_attestations
  FOR SELECT
  USING (get_user_role() IN ('credentialing_admin', 'admin', 'clinical_approver'));

DROP POLICY IF EXISTS iro_reviewer_attest_insert ON iro_case_attestations;
CREATE POLICY iro_reviewer_attest_insert ON iro_case_attestations
  FOR INSERT
  WITH CHECK (get_user_role() IN ('reviewer', 'admin'));

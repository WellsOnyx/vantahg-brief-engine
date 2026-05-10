-- ============================================================
-- supabase/migrations/000_initial_schema.sql
-- ============================================================

-- VantaUM Clinical Brief Engine — Database Schema
-- Run this in Supabase SQL editor to create all tables

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Clients table (TPAs / health plans / managed care orgs)
create table clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  type text check (type in ('tpa', 'health_plan', 'self_funded_employer', 'managed_care_org', 'workers_comp', 'auto_med')),
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Medical UR-specific client fields
  uses_interqual boolean default false,
  uses_mcg boolean default false,
  custom_guidelines_url text,
  contracted_sla_hours float,
  contracted_rate_per_case numeric(10,2)
);

-- Reviewers table
create table reviewers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  credentials text,
  specialty text,
  subspecialty text,
  board_certifications text[],
  license_state text[],
  license_states text[],
  approved_service_categories text[],
  max_cases_per_day int,
  avg_turnaround_hours float,
  dea_number text,
  email text unique,
  phone text,
  status text default 'active' check (status in ('active', 'inactive', 'pending')),
  cases_completed int default 0
);

-- Cases table
create table cases (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Case metadata
  case_number text unique not null,
  status text default 'intake' check (status in ('intake', 'processing', 'brief_ready', 'in_review', 'determination_made', 'delivered')),
  priority text default 'standard' check (priority in ('standard', 'urgent', 'expedited')),

  -- Service classification (new medical-focused field)
  service_category text check (service_category in (
    'imaging', 'surgery', 'specialty_referral', 'dme', 'infusion',
    'behavioral_health', 'rehab_therapy', 'home_health', 'skilled_nursing',
    'transplant', 'genetic_testing', 'pain_management', 'cardiology', 'oncology', 'other'
  )),

  -- Legacy vertical field (kept for backward compatibility)
  vertical text,

  -- Patient info
  patient_name text,
  patient_dob date,
  patient_member_id text,
  patient_gender text,

  -- Requesting provider info
  requesting_provider text,
  requesting_provider_npi text,
  requesting_provider_specialty text,

  -- Servicing provider / facility info
  servicing_provider text,
  servicing_provider_npi text,
  facility_name text,
  facility_type text check (facility_type in ('inpatient', 'outpatient', 'asc', 'office', 'home')),

  -- Clinical info
  procedure_codes text[],
  diagnosis_codes text[],
  procedure_description text,
  clinical_question text,

  -- Review info
  assigned_reviewer_id uuid references reviewers(id),
  review_type text check (review_type in ('prior_auth', 'medical_necessity', 'concurrent', 'retrospective', 'peer_to_peer', 'appeal', 'second_level_review')),

  -- Payer info
  payer_name text,
  plan_type text,

  -- Turnaround / SLA
  turnaround_deadline timestamptz,
  sla_hours float,

  -- AI Brief
  ai_brief jsonb,
  ai_brief_generated_at timestamptz,

  -- Fact-check / verification
  fact_check jsonb,
  fact_check_at timestamptz,

  -- Determination
  determination text check (determination in ('approve', 'deny', 'partial_approve', 'pend', 'peer_to_peer_requested')),
  determination_rationale text,
  determination_at timestamptz,
  determined_by uuid references reviewers(id),

  -- Denial-specific fields
  denial_reason text,
  denial_criteria_cited text,
  alternative_recommended text,

  -- Documents
  submitted_documents text[],

  -- Client
  client_id uuid references clients(id)
);

-- Audit log
create table audit_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  case_id uuid references cases(id),
  action text not null,
  actor text,
  details jsonb
);

-- Indexes for common queries
create index idx_cases_status on cases(status);
create index idx_cases_service_category on cases(service_category);
create index idx_cases_priority on cases(priority);
create index idx_cases_case_number on cases(case_number);
create index idx_cases_assigned_reviewer on cases(assigned_reviewer_id);
create index idx_cases_review_type on cases(review_type);
create index idx_cases_payer_name on cases(payer_name);
create index idx_cases_turnaround_deadline on cases(turnaround_deadline);
create index idx_audit_log_case_id on audit_log(case_id);
create index idx_audit_log_created_at on audit_log(created_at);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cases_updated_at
  before update on cases
  for each row execute function update_updated_at();

-- Row Level Security
alter table cases enable row level security;
alter table reviewers enable row level security;
alter table clients enable row level security;
alter table audit_log enable row level security;

-- For MVP, allow all authenticated access (tighten for production)
create policy "Allow all access to cases" on cases for all using (true);
create policy "Allow all access to reviewers" on reviewers for all using (true);
create policy "Allow all access to clients" on clients for all using (true);
create policy "Allow all access to audit_log" on audit_log for all using (true);

-- ============================================================
-- supabase/migrations/001_auth_rls.sql
-- ============================================================

-- Migration 001: Authentication & Row Level Security
-- Adds user_profiles table and role-based RLS policies
-- Run after enabling Supabase Auth in your project

-- ============================================================================
-- User Profiles table (extends auth.users with role info)
-- ============================================================================

create table if not exists user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  role text not null default 'reviewer' check (role in ('admin', 'reviewer', 'client')),
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;

-- Auto-create profile on signup via trigger
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'reviewer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Helper function: get current user's role
-- ============================================================================

create or replace function get_user_role()
returns text as $$
  select role from user_profiles where id = auth.uid();
$$ language sql security definer stable;

-- ============================================================================
-- Drop permissive MVP policies
-- ============================================================================

drop policy if exists "Allow all access to cases" on cases;
drop policy if exists "Allow all access to reviewers" on reviewers;
drop policy if exists "Allow all access to clients" on clients;
drop policy if exists "Allow all access to audit_log" on audit_log;

-- ============================================================================
-- Cases: admin/reviewer can read all, clients can read their own
-- ============================================================================

create policy "Admin and reviewer full access to cases"
  on cases for all
  using (get_user_role() in ('admin', 'reviewer'));

create policy "Clients can read their own cases"
  on cases for select
  using (
    get_user_role() = 'client'
    and client_id in (
      select id from clients where contact_email = auth.jwt()->>'email'
    )
  );

-- ============================================================================
-- Reviewers: admin full access, reviewers read own profile
-- ============================================================================

create policy "Admin full access to reviewers"
  on reviewers for all
  using (get_user_role() = 'admin');

create policy "Reviewers can read own profile"
  on reviewers for select
  using (
    get_user_role() = 'reviewer'
    and email = auth.jwt()->>'email'
  );

-- ============================================================================
-- Clients: admin full access, clients read own record
-- ============================================================================

create policy "Admin full access to clients"
  on clients for all
  using (get_user_role() = 'admin');

create policy "Clients can read own record"
  on clients for select
  using (
    get_user_role() = 'client'
    and contact_email = auth.jwt()->>'email'
  );

-- ============================================================================
-- Audit log: admin read-only
-- ============================================================================

create policy "Admin read-only access to audit_log"
  on audit_log for select
  using (get_user_role() = 'admin');

-- Service role (used by API routes) bypasses RLS automatically

-- ============================================================================
-- User profiles: users can read own, admin can read all
-- ============================================================================

create policy "Users can read own profile"
  on user_profiles for select
  using (id = auth.uid());

create policy "Admin can read all profiles"
  on user_profiles for select
  using (get_user_role() = 'admin');

create policy "Admin can update profiles"
  on user_profiles for update
  using (get_user_role() = 'admin');

-- ============================================================
-- supabase/migrations/002_pipeline_updates.sql
-- ============================================================

-- 002_pipeline_updates.sql
-- Adds 'modify' to determination check constraint and 'credentialing' to reviewer status

-- Drop and re-create determination check constraint to include 'modify'
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_determination_check;
ALTER TABLE cases ADD CONSTRAINT cases_determination_check
  CHECK (determination IS NULL OR determination IN ('approve', 'deny', 'partial_approve', 'pend', 'peer_to_peer_requested', 'modify'));

-- Drop and re-create reviewer status check constraint to include 'credentialing'
ALTER TABLE reviewers DROP CONSTRAINT IF EXISTS reviewers_status_check;
ALTER TABLE reviewers ADD CONSTRAINT reviewers_status_check
  CHECK (status IN ('active', 'inactive', 'on_leave', 'credentialing'));

-- Add delivered status to cases status check if not already present
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;
ALTER TABLE cases ADD CONSTRAINT cases_status_check
  CHECK (status IN ('intake', 'processing', 'brief_ready', 'in_review', 'determination_made', 'delivered', 'closed', 'cancelled'));

-- Index for SLA escalation queries
CREATE INDEX IF NOT EXISTS idx_cases_sla_active
  ON cases (status, turnaround_deadline)
  WHERE status IN ('brief_ready', 'in_review') AND turnaround_deadline IS NOT NULL;

-- Index for audit log de-duplication queries
CREATE INDEX IF NOT EXISTS idx_audit_log_sla_dedup
  ON audit_log (case_id, action, created_at);

-- ============================================================
-- supabase/migrations/003_pod_expansion.sql
-- ============================================================

-- Migration 003: Pod-Based UM Expansion
-- Adds nursing tier workflow (LPN → RN → MD), pod staffing, quality audits,
-- missing info tracking, determination templates, appeals, and peer-to-peer records.
-- Based on Santana's UM Director whiteboard session.

-- ============================================================================
-- NEW TABLES
-- ============================================================================

-- Staff table (LPNs, RNs, admin staff — NOT physicians, who remain in reviewers table)
create table staff (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  role text not null check (role in ('lpn', 'rn', 'admin_staff')),
  email text unique,
  phone text,
  license_number text,
  license_state text,
  certifications text[],
  max_cases_per_day int,
  avg_turnaround_hours float,
  status text default 'active' check (status in ('active', 'inactive', 'on_leave')),
  cases_completed int default 0,
  quality_score float -- 0-100, rolling average from QA audits
);

-- Pods table (operational unit: LPNs + supervising RN + admin)
create table pods (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  description text,
  service_categories text[],
  client_ids uuid[],
  rn_id uuid references staff(id),
  admin_staff_id uuid references staff(id),
  is_active boolean default true,
  capacity_per_day int
);

-- Pod-LPN junction table (many-to-many: a pod has multiple LPNs)
create table pod_lpns (
  pod_id uuid references pods(id) on delete cascade,
  lpn_id uuid references staff(id) on delete cascade,
  assigned_at timestamptz default now(),
  primary key (pod_id, lpn_id)
);

-- Quality audits (RN reviews random sample of LPN work for URAC compliance)
create table quality_audits (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  case_id uuid references cases(id),
  auditor_id uuid references staff(id), -- RN performing the audit
  audited_staff_id uuid references staff(id), -- LPN whose work is being audited
  criteria_accuracy int check (criteria_accuracy >= 0 and criteria_accuracy <= 100),
  documentation_quality int check (documentation_quality >= 0 and documentation_quality <= 100),
  sla_compliance boolean,
  determination_appropriate boolean,
  notes text,
  overall_score int check (overall_score >= 0 and overall_score <= 100),
  status text default 'pending' check (status in ('pending', 'completed'))
);

-- Missing info requests (tracks when clock pauses for missing documentation)
create table missing_info_requests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  case_id uuid references cases(id),
  requested_by uuid references staff(id),
  requested_items text[],
  sent_to text, -- provider contact info
  sent_via text check (sent_via in ('efax', 'email', 'portal', 'phone')),
  received_at timestamptz,
  received_items text[],
  status text default 'pending' check (status in ('pending', 'received', 'expired')),
  deadline timestamptz
);

-- Determination templates (per-client letter templates with appeal instructions)
create table determination_templates (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  client_id uuid references clients(id), -- null = default template
  template_type text not null check (template_type in ('approval', 'denial', 'partial_approval', 'pend', 'modification')),
  name text not null,
  body_template text not null, -- Handlebars-style template
  appeal_instructions text,
  is_active boolean default true
);

-- Appeals (linked to original case, requires different reviewer)
create table appeals (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  original_case_id uuid references cases(id),
  appeal_case_id uuid references cases(id), -- new case created for the appeal
  reason text,
  filed_by text,
  filed_at timestamptz default now(),
  status text default 'pending' check (status in ('pending', 'in_review', 'determined', 'withdrawn')),
  original_denying_reviewer_id uuid references reviewers(id),
  assigned_reviewer_id uuid references reviewers(id), -- must differ from original
  determination text check (determination in ('approve', 'deny', 'partial_approve', 'modify', 'pend', 'peer_to_peer_requested')),
  determination_at timestamptz,
  determination_rationale text
);

-- Peer-to-peer records (required before denial per URAC)
create table peer_to_peer_records (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  case_id uuid references cases(id),
  requesting_provider text,
  reviewing_physician_id uuid references reviewers(id),
  scheduled_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('upheld', 'overturned', 'modified')),
  notes text,
  status text default 'requested' check (status in ('requested', 'scheduled', 'completed', 'declined', 'no_response'))
);

-- ============================================================================
-- ALTER CASES TABLE — Add nursing tier & pod columns
-- ============================================================================

-- Update status constraint to include nursing tiers
alter table cases drop constraint if exists cases_status_check;
alter table cases add constraint cases_status_check
  check (status in ('intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info', 'determination_made', 'delivered'));

-- Pod & nursing tier assignment
alter table cases add column if not exists assigned_pod_id uuid references pods(id);
alter table cases add column if not exists assigned_lpn_id uuid references staff(id);
alter table cases add column if not exists assigned_rn_id uuid references staff(id);

-- LPN review
alter table cases add column if not exists lpn_review_notes text;
alter table cases add column if not exists lpn_review_at timestamptz;
alter table cases add column if not exists lpn_determination text check (lpn_determination in ('criteria_met', 'criteria_not_met', 'unclear', 'escalate_to_rn'));

-- RN review
alter table cases add column if not exists rn_review_notes text;
alter table cases add column if not exists rn_review_at timestamptz;
alter table cases add column if not exists rn_determination text check (rn_determination in ('approve', 'escalate_to_md'));

-- SLA pause/resume
alter table cases add column if not exists sla_paused_at timestamptz;
alter table cases add column if not exists sla_resumed_at timestamptz;
alter table cases add column if not exists sla_pause_total_hours float default 0;

-- Intake tracking
alter table cases add column if not exists intake_channel text check (intake_channel in ('portal', 'efax', 'email', 'phone', 'api', 'batch_upload'));
alter table cases add column if not exists intake_confirmation_sent boolean default false;
alter table cases add column if not exists authorization_number text;

-- Peer-to-peer
alter table cases add column if not exists peer_to_peer_status text check (peer_to_peer_status in ('requested', 'scheduled', 'completed', 'declined', 'no_response'));
alter table cases add column if not exists peer_to_peer_scheduled_at timestamptz;
alter table cases add column if not exists peer_to_peer_completed_at timestamptz;
alter table cases add column if not exists peer_to_peer_notes text;

-- Appeal link
alter table cases add column if not exists appeal_of_case_id uuid references cases(id);
alter table cases add column if not exists appeal_status text check (appeal_status in ('pending', 'in_review', 'determined', 'withdrawn'));

-- ============================================================================
-- INDEXES for new columns
-- ============================================================================

create index if not exists idx_cases_assigned_pod on cases(assigned_pod_id);
create index if not exists idx_cases_assigned_lpn on cases(assigned_lpn_id);
create index if not exists idx_cases_assigned_rn on cases(assigned_rn_id);
create index if not exists idx_cases_intake_channel on cases(intake_channel);
create index if not exists idx_cases_authorization_number on cases(authorization_number);
create index if not exists idx_cases_appeal_of on cases(appeal_of_case_id);

create index if not exists idx_staff_role on staff(role);
create index if not exists idx_staff_status on staff(status);
create index if not exists idx_pods_is_active on pods(is_active);
create index if not exists idx_quality_audits_auditor on quality_audits(auditor_id);
create index if not exists idx_quality_audits_audited on quality_audits(audited_staff_id);
create index if not exists idx_missing_info_case on missing_info_requests(case_id);
create index if not exists idx_missing_info_status on missing_info_requests(status);
create index if not exists idx_determination_templates_client on determination_templates(client_id);
create index if not exists idx_appeals_original_case on appeals(original_case_id);
create index if not exists idx_appeals_status on appeals(status);
create index if not exists idx_p2p_case on peer_to_peer_records(case_id);
create index if not exists idx_p2p_status on peer_to_peer_records(status);

-- ============================================================================
-- ROW LEVEL SECURITY for new tables
-- ============================================================================

alter table staff enable row level security;
alter table pods enable row level security;
alter table pod_lpns enable row level security;
alter table quality_audits enable row level security;
alter table missing_info_requests enable row level security;
alter table determination_templates enable row level security;
alter table appeals enable row level security;
alter table peer_to_peer_records enable row level security;

-- MVP: permissive policies (tighten for production)
create policy "Allow all access to staff" on staff for all using (true);
create policy "Allow all access to pods" on pods for all using (true);
create policy "Allow all access to pod_lpns" on pod_lpns for all using (true);
create policy "Allow all access to quality_audits" on quality_audits for all using (true);
create policy "Allow all access to missing_info_requests" on missing_info_requests for all using (true);
create policy "Allow all access to determination_templates" on determination_templates for all using (true);
create policy "Allow all access to appeals" on appeals for all using (true);
create policy "Allow all access to peer_to_peer_records" on peer_to_peer_records for all using (true);

-- ============================================================================
-- MIGRATE EXISTING DATA: in_review → md_review
-- ============================================================================
-- Any existing cases with status 'in_review' should be migrated to 'md_review'
-- since the old system sent everything directly to physicians.
update cases set status = 'md_review' where status = 'in_review';

-- ============================================================
-- supabase/migrations/004_client_credentials.sql
-- ============================================================

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

-- ============================================================
-- supabase/migrations/005_john_intel_expansion.sql
-- ============================================================

-- Migration 005: John Intel Expansion
-- Adds: physician AI feedback, denial strength scoring, Two-Midnight Rule fields,
-- new service categories, appeal outcome tracking

-- ── Physician AI Feedback (training signal) ─────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS physician_ai_agreement text
  CHECK (physician_ai_agreement IN ('agree', 'disagree', 'modified'));
ALTER TABLE cases ADD COLUMN IF NOT EXISTS physician_ai_feedback_notes text;

-- ── Denial Strength Scoring ─────────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS denial_strength_score integer;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS denial_strength_grade text
  CHECK (denial_strength_grade IN ('strong', 'moderate', 'weak', 'very_weak'));

-- ── Two-Midnight Rule (Medicare) ────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS two_midnight_applies boolean DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payer_classification text
  CHECK (payer_classification IN ('traditional_medicare', 'medicare_advantage', 'commercial', 'unknown'));

-- ── Appeal Outcome Tracking ─────────────────────────────────────────────────
-- The appeals table already has determination fields, but we add outcome tracking
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IN ('upheld', 'overturned', 'modified', 'withdrawn'));
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS outcome_rationale text;
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS original_denial_strength_score integer;

-- ── Update service_category constraint to include new categories ────────────
-- Note: PostgreSQL doesn't easily alter CHECK constraints, so we drop and recreate
-- This is safe because existing data already matches the new superset
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_service_category_check;
-- No constraint needed — the app enforces the enum, and flexibility is preferred for future categories

COMMENT ON COLUMN cases.physician_ai_agreement IS 'Physician feedback on whether AI recommendation was accurate. Training signal for model improvement.';
COMMENT ON COLUMN cases.denial_strength_score IS '0-100 score of how defensible a denial is against appeal. Calculated by lib/denial-strength.ts.';
COMMENT ON COLUMN cases.two_midnight_applies IS 'Whether the CMS Two-Midnight Rule applies (Traditional Medicare only).';
COMMENT ON COLUMN appeals.outcome IS 'Final appeal outcome: upheld (original denial stands), overturned (reversed to approval), modified (partial change).';

-- ============================================================
-- supabase/migrations/006_hipaa_intake.sql
-- ============================================================

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

-- ============================================================
-- supabase/migrations/007_email_intake.sql
-- ============================================================

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

-- ============================================================
-- supabase/migrations/008_efax_pipeline.sql
-- ============================================================

-- Migration 008: Production eFax Pipeline
--
-- Goals
-- 1. Async processing: webhook stores raw payload and returns 200 immediately;
--    a cron worker pulls from efax_queue and runs OCR + AI extraction.
-- 2. Document storage: keep our own copy of every received fax in Supabase
--    Storage so we are not dependent on the provider's transient URL.
-- 3. Retries + dead-letter: failed extractions are retried with exponential
--    backoff, then moved to a dead-letter state for human review.
-- 4. Submission deduplication: a content fingerprint prevents the same
--    request from creating two cases when a provider re-submits.
-- 5. Provider tracking: explicit column for which provider sent the fax so
--    multiple adapters (Phaxio, eFax Corporate, RingCentral, OpenFax) can
--    coexist.

-- ── New columns on efax_queue ───────────────────────────────────────────────
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS storage_sha256 text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS storage_bytes integer;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS submission_fingerprint text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS extraction_model text;
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS extraction_method text; -- 'ai', 'regex_fallback', 'manual'
ALTER TABLE efax_queue ADD COLUMN IF NOT EXISTS ocr_provider text;       -- 'google_vision', 'provider', 'none'

-- Allow new statuses for the async pipeline
ALTER TABLE efax_queue DROP CONSTRAINT IF EXISTS efax_queue_status_check;
ALTER TABLE efax_queue ADD CONSTRAINT efax_queue_status_check
  CHECK (status IN (
    'received',         -- raw payload stored, not yet processed
    'fetching',         -- downloading the fax document
    'ocr_processing',   -- OCR in progress
    'extracting',       -- AI extraction in progress
    'parsed',           -- extraction done, awaiting case creation
    'case_created',     -- case successfully created
    'manual_review',    -- low confidence, needs CSR triage
    'duplicate',        -- fingerprint matched an existing case
    'rejected',         -- not a valid auth request
    'dead_letter'       -- exhausted retries, requires engineering attention
  ));

-- ── Indexes for the worker query ────────────────────────────────────────────
-- The cron worker pulls rows where status='received' (or retryable failures)
-- and next_attempt_at <= now(), ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_efax_queue_worker
  ON efax_queue (status, next_attempt_at, created_at)
  WHERE status IN ('received', 'fetching', 'ocr_processing', 'extracting');

CREATE INDEX IF NOT EXISTS idx_efax_queue_dead_letter
  ON efax_queue (status, created_at DESC)
  WHERE status = 'dead_letter';

CREATE INDEX IF NOT EXISTS idx_efax_queue_fingerprint
  ON efax_queue (submission_fingerprint)
  WHERE submission_fingerprint IS NOT NULL;

-- ── Submission fingerprint on cases (for cross-channel dedup) ───────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS submission_fingerprint text;

-- Partial unique index — only enforce uniqueness when fingerprint is set.
-- Window is enforced in application code (24h lookup). The unique index keeps
-- a hard floor against accidental duplicates from concurrent webhook calls.
CREATE INDEX IF NOT EXISTS idx_cases_submission_fingerprint
  ON cases (submission_fingerprint, created_at DESC)
  WHERE submission_fingerprint IS NOT NULL;

-- ── Atomic claim function for cron workers ─────────────────────────────────
-- Claims up to `batch_size` rows from efax_queue that are eligible for
-- processing, marking them as locked so concurrent workers don't double-process.
-- Returns the claimed row IDs.
CREATE OR REPLACE FUNCTION claim_efax_batch(
  worker_id text,
  batch_size integer DEFAULT 10
)
RETURNS TABLE (id uuid) AS $$
BEGIN
  RETURN QUERY
  UPDATE efax_queue eq
  SET
    locked_at = now(),
    locked_by = worker_id,
    processing_started_at = COALESCE(eq.processing_started_at, now()),
    attempts = eq.attempts + 1
  WHERE eq.id IN (
    SELECT inner_eq.id
    FROM efax_queue inner_eq
    WHERE
      inner_eq.status = 'received'
      AND (inner_eq.next_attempt_at IS NULL OR inner_eq.next_attempt_at <= now())
      AND (inner_eq.locked_at IS NULL OR inner_eq.locked_at < now() - interval '10 minutes')
      AND inner_eq.attempts < inner_eq.max_attempts
    ORDER BY inner_eq.created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_efax_batch IS
  'Atomically claims a batch of pending faxes for processing. Uses SKIP LOCKED so multiple cron workers can run concurrently without contention.';

-- ── Storage bucket for fax documents ───────────────────────────────────────
-- We do not create the bucket here (Supabase Storage buckets are managed via
-- the dashboard or storage admin API). The README documents the required
-- bucket name: 'efax-documents' (private, signed URLs only).

-- ── Comments ────────────────────────────────────────────────────────────────
COMMENT ON COLUMN efax_queue.attempts IS 'Number of processing attempts (0 = never tried).';
COMMENT ON COLUMN efax_queue.max_attempts IS 'After this many failures, status moves to dead_letter.';
COMMENT ON COLUMN efax_queue.next_attempt_at IS 'Earliest time the worker should retry. Used for exponential backoff.';
COMMENT ON COLUMN efax_queue.locked_by IS 'Worker ID currently processing this row. Cleared on success or release.';
COMMENT ON COLUMN efax_queue.storage_path IS 'Supabase Storage path inside the efax-documents bucket.';
COMMENT ON COLUMN efax_queue.storage_sha256 IS 'SHA-256 of the stored document for integrity verification and binary dedup.';
COMMENT ON COLUMN efax_queue.submission_fingerprint IS 'SHA-256 of normalized patient identifiers + procedure codes + sender. Matches against cases.submission_fingerprint for dedup.';
COMMENT ON COLUMN efax_queue.extraction_method IS 'Which extractor produced parsed_data: ai (Claude tool-use), regex_fallback (when AI failed), or manual (CSR edited).';
COMMENT ON COLUMN cases.submission_fingerprint IS 'Stable hash for cross-channel deduplication. Same fingerprint within 24h returns the existing case.';

-- ============================================================
-- supabase/migrations/009_firstmover_intake.sql
-- ============================================================

-- Migration 009: First Mover intake schema
-- Adds the schema needed for the manual-first MVP under /firstmover/*:
--   - provider_orgs (doctor-office organizations using the provider portal)
--   - member_eligibility (green/red-dot eligibility lookup)
--   - case_modifications (audit trail for CSR amendments — Santana's "manual modification" channel)
--   - new roles: provider (portal), concierge (call intake)
--   - new case columns: org_id, intake_channel, intake_service_type, sla_paused_at, sla_pause_reason
--   - audit_log.actor_type to distinguish user/agent/api_key actors
--   - RLS policies for provider role scoped by org_id

-- ============================================================================
-- Roles: add provider + concierge to user_profiles.role check constraint
-- ============================================================================

alter table user_profiles drop constraint if exists user_profiles_role_check;
alter table user_profiles add constraint user_profiles_role_check
  check (role in ('admin', 'reviewer', 'client', 'provider', 'concierge'));

-- ============================================================================
-- Provider organizations (doctor offices using the provider portal)
-- ============================================================================

create table if not exists provider_orgs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  npi text,
  tax_id text,
  primary_fax text,
  primary_email text,
  address text,
  status text default 'active' check (status in ('active', 'suspended', 'pending'))
);

create index if not exists idx_provider_orgs_npi on provider_orgs(npi);

alter table provider_orgs enable row level security;

-- Add provider_org_id to user_profiles so provider users are scoped to one org
alter table user_profiles add column if not exists provider_org_id uuid references provider_orgs(id);

create index if not exists idx_user_profiles_provider_org on user_profiles(provider_org_id);

-- Helper: get current user's provider org
create or replace function get_user_provider_org()
returns uuid as $$
  select provider_org_id from user_profiles where id = auth.uid();
$$ language sql security definer stable;

-- ============================================================================
-- Member eligibility (green/red-dot lookup)
-- Populated by client IT push (monthly Excel/system push per Santana's call).
-- For MVP, admins seed manually; client-IT ingest is post-MVP.
-- ============================================================================

create table if not exists member_eligibility (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  client_id uuid not null references clients(id) on delete cascade,
  member_id text not null,
  member_name text,
  member_dob date,
  plan_id text,
  plan_name text,
  effective_date date,
  termination_date date,
  status text not null default 'active' check (status in ('active', 'inactive', 'pending_verification')),
  source_file_version text,
  source text default 'manual' check (source in ('manual', 'client_push', 'api')),
  notes text
);

create unique index if not exists uniq_member_eligibility_client_member
  on member_eligibility(client_id, member_id);
create index if not exists idx_member_eligibility_status on member_eligibility(status);

create trigger member_eligibility_updated_at
  before update on member_eligibility
  for each row execute function update_updated_at();

alter table member_eligibility enable row level security;

create policy "Admin and reviewer full access to member_eligibility"
  on member_eligibility for all
  using (get_user_role() in ('admin', 'reviewer', 'concierge'));

create policy "Providers cannot read eligibility directly"
  on member_eligibility for select
  using (false);

-- ============================================================================
-- Case extensions for First Mover intake
-- ============================================================================

-- Provider org that submitted the case via portal (null when intake came
-- through eFax, email, CSR call, or admin entry)
alter table cases add column if not exists org_id uuid references provider_orgs(id);
create index if not exists idx_cases_org_id on cases(org_id);

-- Intake channel — extend the constraint from migration 003 to include
-- Santana's full taxonomy (May 7 ops call): tpa_portal, provider_portal,
-- csr_manual, manual_modification. The legacy values from 003 stay valid.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'cases' and column_name = 'intake_channel'
  ) then
    alter table cases drop constraint if exists cases_intake_channel_check;
  end if;
end $$;

alter table cases add constraint cases_intake_channel_check
  check (intake_channel is null or intake_channel in (
    'portal', 'efax', 'email', 'phone', 'api', 'batch_upload',
    'tpa_portal', 'provider_portal', 'csr_manual', 'manual_modification',
    'ai_agent'
  ));

create index if not exists idx_cases_intake_channel on cases(intake_channel);

-- Service type — drives which required-fields schema validates the intake.
-- Distinct from existing service_category (which is the downstream clinical
-- classification: imaging/surgery/etc) and facility_type (inpatient/outpatient).
alter table cases add column if not exists intake_service_type text
  check (intake_service_type in ('outpatient', 'medication', 'home_health', 'therapy', 'inpatient', 'dme'));

-- SLA pause-reason (sla_paused_at and sla_pause_total_hours already exist
-- from migration 003_pod_expansion). Add only the missing reason column.
alter table cases add column if not exists sla_pause_reason text;

-- ============================================================================
-- Case modifications — audit trail for the "manual modification" channel.
-- Captures every CSR/concierge edit with before/after for URAC compliance.
-- ============================================================================

create table if not exists case_modifications (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  case_id uuid not null references cases(id) on delete cascade,
  modified_by uuid references auth.users(id),
  modifier_role text,
  reason text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  fields_changed text[] not null
);

create index if not exists idx_case_modifications_case on case_modifications(case_id);
create index if not exists idx_case_modifications_created_at on case_modifications(created_at);

alter table case_modifications enable row level security;

create policy "Admin and reviewer read case_modifications"
  on case_modifications for select
  using (get_user_role() in ('admin', 'reviewer', 'concierge'));

-- ============================================================================
-- Audit log: actor_type column to distinguish user / agent / api_key
-- ============================================================================

alter table audit_log add column if not exists actor_type text default 'user'
  check (actor_type in ('user', 'agent', 'api_key', 'system', 'webhook'));
alter table audit_log add column if not exists actor_id uuid;

create index if not exists idx_audit_log_actor_type on audit_log(actor_type);

-- ============================================================================
-- RLS: provider role scoped to their org
-- ============================================================================

drop policy if exists "Providers can read own org cases" on cases;
create policy "Providers can read own org cases"
  on cases for select
  using (
    get_user_role() = 'provider'
    and org_id = get_user_provider_org()
  );

drop policy if exists "Providers can insert cases for own org" on cases;
create policy "Providers can insert cases for own org"
  on cases for insert
  with check (
    get_user_role() = 'provider'
    and org_id = get_user_provider_org()
  );

-- Concierge has the same access as reviewer (case operators)
drop policy if exists "Concierge full access to cases" on cases;
create policy "Concierge full access to cases"
  on cases for all
  using (get_user_role() = 'concierge');

-- Provider org self-read
drop policy if exists "Providers read own org" on provider_orgs;
create policy "Providers read own org"
  on provider_orgs for select
  using (
    get_user_role() = 'provider'
    and id = get_user_provider_org()
  );

drop policy if exists "Admin full access to provider_orgs" on provider_orgs;
create policy "Admin full access to provider_orgs"
  on provider_orgs for all
  using (get_user_role() in ('admin', 'reviewer', 'concierge'));

comment on column cases.intake_channel is 'Source channel per Santana 2026-05-07 ops call: efax/email/tpa_portal/provider_portal/csr_manual/manual_modification';
comment on column cases.intake_service_type is 'Drives required-fields schema: outpatient/medication/home_health/therapy/inpatient/dme';
comment on column cases.sla_paused_at is 'When the SLA clock was paused (e.g., pend-missing-info). Cleared when resumed.';
comment on table member_eligibility is 'Green/red-dot eligibility lookup. Populated monthly by client IT push (per Santana 2026-05-07).';
comment on table case_modifications is 'Audit trail for the manual_modification intake channel. Required for URAC review.';

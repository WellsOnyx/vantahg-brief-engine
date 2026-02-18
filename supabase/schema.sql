-- VantaHG Clinical Brief Engine — Database Schema
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

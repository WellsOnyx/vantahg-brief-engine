-- VantaHG Clinical Brief Engine — Database Schema
-- Run this in Supabase SQL editor to create all tables

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Clients table (TPAs / health plans)
create table clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  type text check (type in ('tpa', 'health_plan', 'self_funded_employer', 'dental_plan', 'vision_plan')),
  contact_name text,
  contact_email text,
  contact_phone text
);

-- Reviewers table
create table reviewers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  credentials text,
  specialty text,
  license_state text[],
  email text unique,
  phone text,
  status text default 'active' check (status in ('active', 'inactive', 'pending')),
  cases_completed int default 0,
  avg_turnaround_hours float
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
  vertical text not null check (vertical in ('dental', 'vision', 'medical')),

  -- Patient info
  patient_name text,
  patient_dob date,
  patient_member_id text,

  -- Clinical info
  requesting_provider text,
  requesting_provider_npi text,
  procedure_codes text[],
  diagnosis_codes text[],
  procedure_description text,
  clinical_question text,

  -- Review info
  assigned_reviewer_id uuid references reviewers(id),
  review_type text check (review_type in ('prior_auth', 'medical_necessity', 'concurrent', 'retrospective', 'peer_to_peer', 'appeal')),

  -- Payer info
  payer_name text,
  plan_type text,

  -- AI Brief
  ai_brief jsonb,
  ai_brief_generated_at timestamptz,

  -- Determination
  determination text check (determination in ('approve', 'deny', 'partial_approve', 'pend', 'peer_to_peer_requested')),
  determination_rationale text,
  determination_at timestamptz,
  determined_by uuid references reviewers(id),

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
create index idx_cases_vertical on cases(vertical);
create index idx_cases_priority on cases(priority);
create index idx_cases_case_number on cases(case_number);
create index idx_cases_assigned_reviewer on cases(assigned_reviewer_id);
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

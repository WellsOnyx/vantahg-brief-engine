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

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

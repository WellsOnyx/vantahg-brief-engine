-- First Mover smoke-test seed
-- Idempotent. Paste into Supabase SQL editor and Run.
-- After this lands, the QA clickthrough can execute against real persistence.

-- ── 1. Test TPA client ──────────────────────────────────────────────────────
insert into clients (
  id, name, type, contact_name, contact_email,
  uses_interqual, uses_mcg, contracted_sla_hours,
  onboarding_status, credentials_configured_at
) values (
  '11111111-1111-1111-1111-111111111111',
  'Test TPA',
  'tpa',
  'Demo Contact',
  'demo@example.com',
  true, false, 72,
  'active', now()
)
on conflict (id) do update
  set name = excluded.name,
      onboarding_status = excluded.onboarding_status;

-- ── 2. Member eligibility rows ──────────────────────────────────────────────
-- Member IDs match DEMO_GREEN_MEMBERS / DEMO_RED_MEMBERS in lib/firstmover/eligibility.ts
-- so the same IDs work whether or not Supabase is wired.
insert into member_eligibility (
  client_id, member_id, member_name, member_dob,
  plan_name, effective_date, status, source
) values
  ('11111111-1111-1111-1111-111111111111', 'M1001', 'Jane Doe',    '1985-06-15', 'Test TPA PPO', '2024-01-01', 'active',   'manual'),
  ('11111111-1111-1111-1111-111111111111', 'M1002', 'John Smith',  '1972-11-03', 'Test TPA HMO', '2024-01-01', 'active',   'manual'),
  ('11111111-1111-1111-1111-111111111111', 'M9999', 'Jane Lapsed', '1950-01-01', 'Test TPA PPO', '2020-01-01', 'inactive', 'manual')
on conflict (client_id, member_id) do update
  set status      = excluded.status,
      member_name = excluded.member_name,
      plan_name   = excluded.plan_name;

-- ── 3. Test provider org (for provider portal) ──────────────────────────────
insert into provider_orgs (id, name, npi, primary_email, status)
values (
  '22222222-2222-2222-2222-222222222222',
  'Test Provider Clinic',
  '1234567890',
  'clinic@example.com',
  'active'
)
on conflict (id) do update
  set status = excluded.status;

-- ── Verify counts ───────────────────────────────────────────────────────────
select 'clients' as table_name, count(*) as rows from clients
union all
select 'member_eligibility', count(*) from member_eligibility
union all
select 'provider_orgs', count(*) from provider_orgs;
-- Expected: clients=1, member_eligibility=3, provider_orgs=1

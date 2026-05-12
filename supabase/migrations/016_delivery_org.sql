-- Migration 016 — Delivery organization (Delivery Leads + Concierges)
--
-- Adds the people layer that owns the client-facing delivery model:
--
--   delivery_leads — manage ~10 concierges, host the weekly TPA check-in,
--                    own SLA + relationship for each client.
--   concierges    — front-line operator for one or more clients. Soft cap
--                    of 300 auths/week per concierge (~15k PE/PMs at the
--                    model's ratios).
--   client_concierge_assignments — many-to-many between clients and
--                    concierges. Includes optional `practice_id` so a
--                    single client can have concierges split across the
--                    physician offices they support (V2 — practice_id is
--                    nullable for now and indexed when set).
--
-- Why three tables and not one role-flagged staff table:
--   - delivery_leads and concierges have meaningfully different attributes
--     (concierge has weekly auth volume cap, ringcentral_phone_id; DL has
--     reports-to-partner, weekly check-in default time).
--   - Keeping them separate keeps RLS and dashboard queries simple.
--   - Both reference user_profiles.id for auth identity, so adding either
--     to an internal user is a single row insert.
--
-- The corresponding role values ('delivery-lead', 'concierge') are added
-- to user_profiles.role's check constraint below.

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
    'concierge'
  ));

-- ── delivery_leads ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,

  -- Reports-to. Optional; production will set this to an AVP user_id.
  reports_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Weekly check-in default. Concrete per-client cadence lives on
  -- onboarding_data.kickoff and the future scheduling system.
  default_weekly_checkin_day text CHECK (default_weekly_checkin_day IN ('mon','tue','wed','thu','fri')),
  default_weekly_checkin_time text, -- HH:MM 24h
  default_timezone text DEFAULT 'America/New_York',

  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_delivery_leads_user_id
  ON delivery_leads(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_leads_active
  ON delivery_leads(active) WHERE active;

-- ── concierges ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concierges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  name text NOT NULL,
  email text NOT NULL UNIQUE,

  -- Which DL this concierge reports to. The 1:N relationship is critical
  -- to the dashboard (a DL sees their 10 concierges).
  delivery_lead_id uuid REFERENCES delivery_leads(id) ON DELETE SET NULL,

  -- Telephony — provisioned via Gravity Rail / RingCentral.
  ringcentral_phone text,           -- the assigned DID
  ringcentral_extension text,       -- optional ext on a shared number
  intake_email text,                -- alias on @intake.vantaum.com
  intake_efax text,                 -- assigned Phaxio fax number

  -- Capacity. Soft cap — surfaced in the dashboard. The assignment logic
  -- enforces it on routing.
  weekly_auth_cap integer NOT NULL DEFAULT 300
    CHECK (weekly_auth_cap > 0 AND weekly_auth_cap <= 1000),

  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_concierges_user_id
  ON concierges(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concierges_delivery_lead_id
  ON concierges(delivery_lead_id) WHERE delivery_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concierges_active
  ON concierges(active) WHERE active;

-- ── client_concierge_assignments ──────────────────────────────────────────
-- Maps clients to concierges. Optional practice_id field is reserved for
-- V2 when we model individual physician offices (one concierge per office).
-- For V1 a client has one concierge across all their offices, with
-- practice_id = NULL.
CREATE TABLE IF NOT EXISTS client_concierge_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  concierge_id uuid NOT NULL REFERENCES concierges(id) ON DELETE CASCADE,

  -- Optional sub-scope. NULL = the assignment covers the full client.
  practice_id uuid,                 -- forward-reference; practices table lands in V2

  assigned_at timestamptz DEFAULT now() NOT NULL,
  assigned_by text,                 -- email of DL who created it
  active boolean NOT NULL DEFAULT true,

  -- One active assignment per (client, practice) so we never have two
  -- concierges colliding on the same auth pool. NULL practice_id is
  -- treated as a distinct sentinel by the unique index below.
  CONSTRAINT unique_active_assignment_per_scope UNIQUE
    (client_id, practice_id, active) DEFERRABLE INITIALLY DEFERRED
);

-- The unique constraint above fails for nullable practice_id rows because
-- NULLs are distinct. Add a partial unique index covering the NULL case
-- so a client can have at most one "whole-client" assignment active.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_one_active_full_client
  ON client_concierge_assignments(client_id)
  WHERE practice_id IS NULL AND active;

CREATE INDEX IF NOT EXISTS idx_assignments_client_id
  ON client_concierge_assignments(client_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_assignments_concierge_id
  ON client_concierge_assignments(concierge_id) WHERE active;

-- ── updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_delivery_leads_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS delivery_leads_set_updated_at ON delivery_leads;
CREATE TRIGGER delivery_leads_set_updated_at
  BEFORE UPDATE ON delivery_leads
  FOR EACH ROW EXECUTE FUNCTION set_delivery_leads_updated_at();

CREATE OR REPLACE FUNCTION set_concierges_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS concierges_set_updated_at ON concierges;
CREATE TRIGGER concierges_set_updated_at
  BEFORE UPDATE ON concierges
  FOR EACH ROW EXECUTE FUNCTION set_concierges_updated_at();

CREATE OR REPLACE FUNCTION set_assignments_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS assignments_set_updated_at ON client_concierge_assignments;
CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON client_concierge_assignments
  FOR EACH ROW EXECUTE FUNCTION set_assignments_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE delivery_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierges ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_concierge_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff full access to delivery_leads" ON delivery_leads;
CREATE POLICY "Internal staff full access to delivery_leads"
  ON delivery_leads FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead'));

DROP POLICY IF EXISTS "Internal staff full access to concierges" ON concierges;
CREATE POLICY "Internal staff full access to concierges"
  ON concierges FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead', 'concierge'));

DROP POLICY IF EXISTS "Internal staff full access to assignments" ON client_concierge_assignments;
CREATE POLICY "Internal staff full access to assignments"
  ON client_concierge_assignments FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead', 'concierge'));

-- Refresh the cases/reviewers/clients policies to include the new roles
-- so DL + concierge dashboards can read tenant data.
DROP POLICY IF EXISTS "Internal staff full access to cases" ON cases;
CREATE POLICY "Internal staff full access to cases"
  ON cases FOR ALL
  USING (get_user_role() IN ('admin', 'reviewer', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead', 'concierge'));

DROP POLICY IF EXISTS "Internal staff full access to reviewers" ON reviewers;
CREATE POLICY "Internal staff full access to reviewers"
  ON reviewers FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead'));

DROP POLICY IF EXISTS "Internal staff full access to clients" ON clients;
CREATE POLICY "Internal staff full access to clients"
  ON clients FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead', 'concierge'));

COMMENT ON TABLE delivery_leads IS
  'VantaUM-side Delivery Leads. Each DL manages ~10 concierges and hosts the weekly check-in with their assigned TPAs.';
COMMENT ON TABLE concierges IS
  'Front-line operator role. Owns a phone/email/fax assigned via Gravity Rail. Default cap 300 auths/week (~15k PE/PM lives).';
COMMENT ON TABLE client_concierge_assignments IS
  'Many-to-many between clients and concierges. practice_id is a forward-reference for V2 per-physician-office assignments.';

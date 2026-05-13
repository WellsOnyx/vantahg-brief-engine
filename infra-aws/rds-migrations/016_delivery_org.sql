-- RDS-flavored Migration 016: Delivery organization.
--
-- Identical to supabase/migrations/016_delivery_org.sql except for the
-- auth.users foreign-key references which don't exist on RDS. On RDS,
-- user_id columns are plain uuid pointers to Cognito subs (which live
-- in user_profiles.id after provisioning).

-- Note: role check constraint already updated by the cascade-run of
-- 011/012/014 in the earlier batch. ALTER TABLE on user_profiles is
-- idempotent here (the new role values are in the constraint already).

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN (
    'admin','reviewer','client','builder','ceo','practice-lead','slt',
    'delivery-lead','concierge'
  ));

-- ── delivery_leads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,  -- Cognito sub; soft pointer, no FK
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  reports_to_user_id uuid,  -- soft pointer
  default_weekly_checkin_day text CHECK (default_weekly_checkin_day IN ('mon','tue','wed','thu','fri')),
  default_weekly_checkin_time text,
  default_timezone text DEFAULT 'America/New_York',
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_delivery_leads_user_id ON delivery_leads(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_leads_active ON delivery_leads(active) WHERE active;

-- ── concierges ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concierges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  delivery_lead_id uuid REFERENCES delivery_leads(id) ON DELETE SET NULL,
  ringcentral_phone text,
  ringcentral_extension text,
  intake_email text,
  intake_efax text,
  weekly_auth_cap integer NOT NULL DEFAULT 300
    CHECK (weekly_auth_cap > 0 AND weekly_auth_cap <= 1000),
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_concierges_user_id ON concierges(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concierges_delivery_lead_id ON concierges(delivery_lead_id) WHERE delivery_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concierges_active ON concierges(active) WHERE active;

-- ── client_concierge_assignments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_concierge_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  concierge_id uuid NOT NULL REFERENCES concierges(id) ON DELETE CASCADE,
  practice_id uuid,
  assigned_at timestamptz DEFAULT now() NOT NULL,
  assigned_by text,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT unique_active_assignment_per_scope UNIQUE
    (client_id, practice_id, active) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_one_active_full_client
  ON client_concierge_assignments(client_id)
  WHERE practice_id IS NULL AND active;

CREATE INDEX IF NOT EXISTS idx_assignments_client_id
  ON client_concierge_assignments(client_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_assignments_concierge_id
  ON client_concierge_assignments(concierge_id) WHERE active;

-- ── triggers ────────────────────────────────────────────────────────────────
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

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE delivery_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierges ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_concierge_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff full access to delivery_leads" ON delivery_leads;
CREATE POLICY "Internal staff full access to delivery_leads" ON delivery_leads FOR ALL
  USING (get_user_role() IN ('admin','builder','ceo','practice-lead','slt','delivery-lead'));

DROP POLICY IF EXISTS "Internal staff full access to concierges" ON concierges;
CREATE POLICY "Internal staff full access to concierges" ON concierges FOR ALL
  USING (get_user_role() IN ('admin','builder','ceo','practice-lead','slt','delivery-lead','concierge'));

DROP POLICY IF EXISTS "Internal staff full access to assignments" ON client_concierge_assignments;
CREATE POLICY "Internal staff full access to assignments" ON client_concierge_assignments FOR ALL
  USING (get_user_role() IN ('admin','builder','ceo','practice-lead','slt','delivery-lead','concierge'));

-- Refresh case/reviewer/client policies for the new roles
DROP POLICY IF EXISTS "Internal staff full access to cases" ON cases;
CREATE POLICY "Internal staff full access to cases" ON cases FOR ALL
  USING (get_user_role() IN ('admin','reviewer','builder','ceo','practice-lead','slt','delivery-lead','concierge'));

DROP POLICY IF EXISTS "Internal staff full access to reviewers" ON reviewers;
CREATE POLICY "Internal staff full access to reviewers" ON reviewers FOR ALL
  USING (get_user_role() IN ('admin','builder','ceo','practice-lead','slt','delivery-lead'));

DROP POLICY IF EXISTS "Internal staff full access to clients" ON clients;
CREATE POLICY "Internal staff full access to clients" ON clients FOR ALL
  USING (get_user_role() IN ('admin','builder','ceo','practice-lead','slt','delivery-lead','concierge'));

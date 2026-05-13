-- RDS-flavored Migration 019: Practices + practice_users.
--
-- Identical to supabase/migrations/019_practices.sql except for the
-- auth.users foreign-key references and the auth.uid()/auth.jwt() calls
-- which don't exist on RDS. On RDS, user_id is a plain uuid pointer
-- (Cognito sub or auth_user_id from user_profiles). RLS policies that
-- previously used auth.uid() are dropped on the RDS side and replaced
-- with the get_user_role()-only gate the rest of the schema uses.

-- ── practices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  name text NOT NULL,
  npi text,
  tax_id text,
  specialty text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  phone text,
  fax text,

  estimated_weekly_auths integer NOT NULL DEFAULT 0
    CHECK (estimated_weekly_auths >= 0),

  active boolean NOT NULL DEFAULT true,

  notes text
);

CREATE INDEX IF NOT EXISTS idx_practices_client_id
  ON practices(client_id);
CREATE INDEX IF NOT EXISTS idx_practices_active
  ON practices(client_id, active)
  WHERE active;
CREATE INDEX IF NOT EXISTS idx_practices_npi
  ON practices(npi)
  WHERE npi IS NOT NULL;

CREATE OR REPLACE FUNCTION set_practices_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS practices_set_updated_at ON practices;
CREATE TRIGGER practices_set_updated_at
  BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION set_practices_updated_at();

-- ── practice_users (junction: user ↔ practice) ──────────────────────────
CREATE TABLE IF NOT EXISTS practice_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,

  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  -- On RDS: soft pointer to Cognito sub. No FK to auth.users (doesn't exist).
  user_id uuid NOT NULL,

  role text NOT NULL DEFAULT 'staff'
    CHECK (role IN ('admin', 'staff')),

  invited_by text,
  invited_at timestamptz DEFAULT now() NOT NULL,
  accepted_at timestamptz,

  CONSTRAINT unique_practice_user UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_users_user_id
  ON practice_users(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_users_practice_id
  ON practice_users(practice_id);

-- ── Add practice_id to cases ───────────────────────────────────────────
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_practice_id
  ON cases(practice_id)
  WHERE practice_id IS NOT NULL;

COMMENT ON COLUMN cases.practice_id IS
  'The physician office that submitted this case. Set from the provider portal. NULL for legacy / non-portal cases.';

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_users ENABLE ROW LEVEL SECURITY;

-- Internal staff full access. Tenant-scoping for TPA/practice users will
-- be added when Cognito auth is cut over and we have session GUCs to
-- read; for V1 the app uses the service-role connection and enforces
-- scope at the API layer.
DROP POLICY IF EXISTS "Internal staff full access to practices" ON practices;
CREATE POLICY "Internal staff full access to practices"
  ON practices FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead', 'concierge'));

DROP POLICY IF EXISTS "Internal staff full access to practice_users" ON practice_users;
CREATE POLICY "Internal staff full access to practice_users"
  ON practice_users FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead', 'concierge'));

COMMENT ON TABLE practices IS
  'Physician offices in a TPA''s network. A practice belongs to one TPA (V1). Concierge routing uses practice_id on client_concierge_assignments for per-office targeting.';
COMMENT ON TABLE practice_users IS
  'Junction: which Cognito users belong to which practices. Role admin can invite + edit; role staff can only submit cases.';

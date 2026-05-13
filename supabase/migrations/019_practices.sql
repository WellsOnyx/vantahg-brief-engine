-- Migration 019 — Practices + practice users
--
-- Physician offices that a TPA covers in-network. A TPA has many practices;
-- a practice belongs to exactly one TPA at a time (V1 assumption — most
-- doctor's offices contract with one plan administrator per patient pool).
--
-- Why a separate practices table instead of stuffing it onto cases:
--   - Concierge assignment routes per-practice (see client_concierge_assignments.practice_id)
--   - Provider portal scopes everything by practice_id
--   - Historical volume by practice powers "best concierge to assign" logic
--
-- practice_users joins auth users to practices. A user can technically
-- be linked to multiple practices (different doctor's office staff who
-- moonlight), so it's a junction table - not a column on user_profiles.

CREATE TABLE IF NOT EXISTS practices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Tenant this practice belongs to. CASCADE delete because a TPA leaving
  -- means their practice records go with them.
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  name text NOT NULL,
  npi text,                              -- National Provider Identifier (10 digits)
  tax_id text,
  specialty text,                        -- free text for V1; could become FK to a taxonomy later
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  phone text,
  fax text,

  -- Historical volume metric for the routing algorithm. Updated by a
  -- nightly job (V2); for V1 it's set at create time from the onboarding
  -- estimate.
  estimated_weekly_auths integer NOT NULL DEFAULT 0
    CHECK (estimated_weekly_auths >= 0),

  -- Whether this practice can submit new cases. Toggled off when the
  -- TPA terminates the contract or while the practice is being
  -- onboarded but not yet live.
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

-- updated_at maintenance
CREATE OR REPLACE FUNCTION set_practices_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS practices_set_updated_at ON practices;
CREATE TRIGGER practices_set_updated_at
  BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION set_practices_updated_at();

-- ── practice_users (junction: user ↔ practice) ────────────────────────────
CREATE TABLE IF NOT EXISTS practice_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,

  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 'admin' can invite other users + edit practice settings.
  -- 'staff' can only submit cases + view their practice's cases.
  role text NOT NULL DEFAULT 'staff'
    CHECK (role IN ('admin', 'staff')),

  invited_by text,                       -- email of TPA user who invited
  invited_at timestamptz DEFAULT now() NOT NULL,
  accepted_at timestamptz,               -- set when user first signs in via magic link

  -- One row per (practice, user) pair.
  CONSTRAINT unique_practice_user UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_users_user_id
  ON practice_users(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_users_practice_id
  ON practice_users(practice_id);

-- ── Add practice_id to cases (was reserved on client_concierge_assignments only) ──
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_practice_id
  ON cases(practice_id)
  WHERE practice_id IS NOT NULL;

COMMENT ON COLUMN cases.practice_id IS
  'The physician office that submitted this case. Set when the case is created from the provider portal. NULL for legacy cases pre-portal.';

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_users ENABLE ROW LEVEL SECURITY;

-- Practices: internal staff full access; TPA-side users (role=client) see
-- practices for their own tenant; practice users see only their practices.
DROP POLICY IF EXISTS "Internal staff full access to practices" ON practices;
CREATE POLICY "Internal staff full access to practices"
  ON practices FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead', 'concierge'));

DROP POLICY IF EXISTS "TPA users see their tenant practices" ON practices;
CREATE POLICY "TPA users see their tenant practices"
  ON practices FOR SELECT
  USING (
    get_user_role() = 'client'
    AND client_id IN (
      SELECT id FROM clients WHERE contact_email = auth.jwt()->>'email'
    )
  );

DROP POLICY IF EXISTS "Practice users see their own practices" ON practices;
CREATE POLICY "Practice users see their own practices"
  ON practices FOR SELECT
  USING (
    id IN (
      SELECT practice_id FROM practice_users WHERE user_id = auth.uid()
    )
  );

-- practice_users: internal staff + the user themselves can read; only
-- internal staff or practice admin can write.
DROP POLICY IF EXISTS "Internal staff full access to practice_users" ON practice_users;
CREATE POLICY "Internal staff full access to practice_users"
  ON practice_users FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead', 'concierge'));

DROP POLICY IF EXISTS "Users see their own practice memberships" ON practice_users;
CREATE POLICY "Users see their own practice memberships"
  ON practice_users FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE practices IS
  'Physician offices in a TPA''s network. A practice belongs to one TPA (V1). Concierge routing uses practice_id on client_concierge_assignments for per-office targeting.';
COMMENT ON TABLE practice_users IS
  'Junction: which auth.users belong to which practices. Role admin can invite + edit; role staff can only submit cases.';

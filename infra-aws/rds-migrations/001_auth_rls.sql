-- RDS-flavored Migration 001: Authentication & Row Level Security
--
-- Replaces supabase/migrations/001_auth_rls.sql on the AWS side.
-- Differences from the Supabase original:
--   1. user_profiles.id is plain uuid (no FK to auth.users which doesn't
--      exist on RDS). The application sets it to the Cognito sub at
--      provisioning time.
--   2. auth.uid() replaced with current_setting('vantaum.user_id', true)
--      which the Next.js middleware sets on every request via
--      `SET LOCAL vantaum.user_id = '<cognito-sub>'`.
--   3. auth.jwt() lookups replaced with current_setting('vantaum.user_email').
--   4. handle_new_user trigger removed - on AWS the application creates
--      the user_profiles row explicitly after Cognito user creation.
--   5. No "service role bypasses RLS" notion - we use a separate
--      vantaum_app DB role with BYPASSRLS, created by a separate script.
--
-- All other semantics identical: get_user_role() returns the role
-- for the current session user, policies gate by role.

-- ============================================================================
-- Session-context helpers
-- ============================================================================

-- These wrap the session GUCs the app middleware sets. Each request to
-- the app should begin with:
--   SET LOCAL vantaum.user_id   = '<cognito-sub>';
--   SET LOCAL vantaum.user_email = '<email>';
-- so that RLS policies have a stable view of who's calling.

CREATE OR REPLACE FUNCTION vantaum_current_user_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('vantaum.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION vantaum_current_user_email()
RETURNS text AS $$
  SELECT NULLIF(current_setting('vantaum.user_email', true), '');
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- User Profiles table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY,
  name text,
  role text NOT NULL DEFAULT 'reviewer'
    CHECK (role IN (
      'admin', 'reviewer', 'client',
      'builder', 'ceo', 'practice-lead', 'slt',
      'delivery-lead', 'concierge'
    )),
  email text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON user_profiles(email) WHERE email IS NOT NULL;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- get_user_role() - same signature as Supabase version, RDS-backed
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM user_profiles WHERE id = vantaum_current_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- Drop permissive MVP policies (no-ops if they don't exist)
-- ============================================================================

DROP POLICY IF EXISTS "Allow all access to cases" ON cases;
DROP POLICY IF EXISTS "Allow all access to reviewers" ON reviewers;
DROP POLICY IF EXISTS "Allow all access to clients" ON clients;
DROP POLICY IF EXISTS "Allow all access to audit_log" ON audit_log;

-- ============================================================================
-- Cases
-- ============================================================================

DROP POLICY IF EXISTS "Admin and reviewer full access to cases" ON cases;
CREATE POLICY "Admin and reviewer full access to cases"
  ON cases FOR ALL
  USING (get_user_role() IN ('admin', 'reviewer'));

DROP POLICY IF EXISTS "Clients can read their own cases" ON cases;
CREATE POLICY "Clients can read their own cases"
  ON cases FOR SELECT
  USING (
    get_user_role() = 'client'
    AND client_id IN (
      SELECT id FROM clients WHERE contact_email = vantaum_current_user_email()
    )
  );

-- ============================================================================
-- Reviewers
-- ============================================================================

DROP POLICY IF EXISTS "Admin full access to reviewers" ON reviewers;
CREATE POLICY "Admin full access to reviewers"
  ON reviewers FOR ALL
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Reviewers can read own profile" ON reviewers;
CREATE POLICY "Reviewers can read own profile"
  ON reviewers FOR SELECT
  USING (
    get_user_role() = 'reviewer'
    AND email = vantaum_current_user_email()
  );

-- ============================================================================
-- Clients
-- ============================================================================

DROP POLICY IF EXISTS "Admin full access to clients" ON clients;
CREATE POLICY "Admin full access to clients"
  ON clients FOR ALL
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Clients can read own record" ON clients;
CREATE POLICY "Clients can read own record"
  ON clients FOR SELECT
  USING (
    get_user_role() = 'client'
    AND contact_email = vantaum_current_user_email()
  );

-- ============================================================================
-- Audit log
-- ============================================================================

DROP POLICY IF EXISTS "Admin read-only access to audit_log" ON audit_log;
CREATE POLICY "Admin read-only access to audit_log"
  ON audit_log FOR SELECT
  USING (get_user_role() = 'admin');

-- ============================================================================
-- User profiles
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (id = vantaum_current_user_id());

DROP POLICY IF EXISTS "Admin can read all profiles" ON user_profiles;
CREATE POLICY "Admin can read all profiles"
  ON user_profiles FOR SELECT
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update profiles" ON user_profiles;
CREATE POLICY "Admin can update profiles"
  ON user_profiles FOR UPDATE
  USING (get_user_role() = 'admin');

COMMENT ON FUNCTION vantaum_current_user_id() IS
  'Returns the current request user id from session GUC vantaum.user_id. Set by app middleware on each request. Replaces Supabase auth.uid().';
COMMENT ON FUNCTION get_user_role() IS
  'Returns the role for the current session user. SECURITY DEFINER so RLS policies can read user_profiles without recursive RLS.';

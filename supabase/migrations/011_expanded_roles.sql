-- Migration 011 — Expanded role set for organizational structure
--
-- Adds four organizational roles beyond the original admin/reviewer/client
-- triad: builder (growth + product roster), ceo (executive overview),
-- practice-lead (clinical operations leadership), slt (senior leadership
-- team). These map to the role-gated views at /builders, /office-ceo,
-- and influence which nav links surface in AppShell.
--
-- Behavior of role-aware code if a row carries a new role:
--   - lib/auth-guard.ts UserRole type is extended in lockstep.
--   - requireRole(['admin']) continues to gate the same way.
--   - lib/case-access.ts treats the new roles like 'admin'/'reviewer' for
--     internal access — they are VantaUM-side users, not tenant clients.
--   - RLS policies in 001 reference get_user_role() in ('admin','reviewer')
--     for full case access. The new roles get the SAME access (treated
--     as internal staff) — see the policy refresh below.
--
-- Idempotent: drops + recreates the check constraint, and updates the
-- RLS policy. Safe to re-run.

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
    'slt'
  ));

-- Extend the case-access RLS policy so the new internal roles can read
-- cases the same way admin/reviewer can. Without this, builder/ceo/etc.
-- users would hit RLS denials on any tenant case.
DROP POLICY IF EXISTS "Admin and reviewer full access to cases" ON cases;
CREATE POLICY "Internal staff full access to cases"
  ON cases FOR ALL
  USING (get_user_role() IN ('admin', 'reviewer', 'builder', 'ceo', 'practice-lead', 'slt'));

-- Same treatment for the reviewers + clients tables — internal staff need
-- to read them to populate roster views, billing dashboards, etc.
DROP POLICY IF EXISTS "Admin full access to reviewers" ON reviewers;
CREATE POLICY "Internal staff full access to reviewers"
  ON reviewers FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt'));

DROP POLICY IF EXISTS "Admin full access to clients" ON clients;
CREATE POLICY "Internal staff full access to clients"
  ON clients FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt'));

COMMENT ON CONSTRAINT user_profiles_role_check ON user_profiles IS
  'admin/reviewer/client are the operational triad. builder/ceo/practice-lead/slt are organizational views layered on top — they have internal-staff access to cases/reviewers/clients via RLS.';

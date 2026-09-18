-- RDS bootstrap — run first, before any supabase/ or rds-flavored migration.
--
-- Makes later SQL that still mentions auth.uid() / auth.jwt() / auth.users
-- apply on plain Postgres 15. The application service role (vantaum_admin
-- today, vantaum_app later) bypasses RLS; session GUCs are for the day
-- we tighten per-request identity.
--
-- Safe to re-run. No secrets, no PHI.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Session GUCs the app may SET LOCAL per request.
-- missing_ok=true so a connection without them does not throw.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.sub', true),
      current_setting('vantaum.user_id', true)
    ),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_build_object(
      'email', NULLIF(current_setting('vantaum.user_email', true), ''),
      'sub', NULLIF(current_setting('vantaum.user_id', true), ''),
      'user_role', NULLIF(current_setting('vantaum.user_role', true), '')
    )
  );
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('vantaum.user_role', true), ''),
    'anon'
  );
$$;

-- Applied-migration ledger used by scripts/apply-rds-migrations.mjs
CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  checksum text,
  notes text
);

COMMENT ON TABLE schema_migrations IS
  'VantaUM RDS apply ledger. id is the migration filename stem (e.g. 000_rds_bootstrap).';

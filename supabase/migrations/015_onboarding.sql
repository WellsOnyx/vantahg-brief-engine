-- Migration 015 — Onboarding wizard state
--
-- Captures the post-signature onboarding the TPA walks through after
-- clicking their magic link. Lives on signup_requests because the data
-- collected here (logo, brand color, primary book of business, plan
-- documents, intake preferences, key contacts) is per-tenant and
-- already conceptually a continuation of the signup flow.
--
-- onboarding_status flow:
--   not_started → in_progress → completed
--
-- onboarding_data is a JSONB blob keyed by wizard step. Schema-on-read
-- because the wizard steps will evolve fast in early days; we don't
-- want a migration per added field. Type definitions live in
-- lib/onboarding/types.ts.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed'));

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz;

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Partial index for the dashboards that surface in-flight onboardings
-- (delivery lead view, kickoff queue).
CREATE INDEX IF NOT EXISTS idx_signup_requests_onboarding_in_progress
  ON signup_requests(client_id)
  WHERE onboarding_status = 'in_progress';

COMMENT ON COLUMN signup_requests.onboarding_status IS
  'TPA-side onboarding wizard state. Transitions to in_progress when the TPA opens the wizard for the first time, and to completed when they finish the final step.';
COMMENT ON COLUMN signup_requests.onboarding_data IS
  'Per-step wizard payload (logo URL, brand color, intake prefs, key contacts, etc.). Schema-on-read — see lib/onboarding/types.ts for the canonical shape.';

-- Migration 035 (RDS variant) — Credentialing service line, Phase 1
-- Identical to supabase/migrations/035_credentialing.sql minus RLS (RDS uses vantaum_admin). (docs/CREDENTIALING_PLAN.md)
--
-- Credentialing is NOT a clinical case: it verifies a PROVIDER (primary-
-- source verification + committee decision), on a per-provider unit with
-- its own cost center (cc_credentialing). It reuses the platform chassis
-- (intake ledger, queue patterns, audit) but none of the clinical stages.
--
-- Four tables:
--   providers                — the credentialed entity (provider PII is
--                              handled with the same discipline as PHI)
--   credentialing_cases      — one per credentialing/re-credentialing cycle
--   verification_items       — one row per PSV element (the engine drives
--                              these; the committee reads them)
--   monitoring_subscriptions — continuous OIG/SAM/license watches between
--                              cycles (Phase 4 consumes; schema lands now)

CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),      -- tenant whose network this provider joins
  npi text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  credential text,                            -- MD, DO, NP, PA, ...
  specialties text[] NOT NULL DEFAULT '{}',
  caqh_provider_id text,                      -- CAQH ProView id when known
  email text,
  license_states text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Same provider may exist per tenant network; NPI unique within a tenant.
CREATE UNIQUE INDEX IF NOT EXISTS providers_client_npi_idx
  ON providers (client_id, npi);

CREATE TABLE IF NOT EXISTS credentialing_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credentialing_number text NOT NULL UNIQUE,  -- CRED-<seq>
  provider_id uuid NOT NULL REFERENCES providers(id),
  client_id uuid REFERENCES clients(id),
  -- initial | recredential
  cycle_type text NOT NULL DEFAULT 'initial',
  -- intake -> psv_in_progress -> committee_review -> decided -> delivered
  status text NOT NULL DEFAULT 'intake',
  -- approved | denied | deferred  (set ONLY by the committee decision path)
  decision text,
  decision_rationale text,
  decided_by text,
  decided_at timestamptz,
  attestation jsonb,                          -- committee attestation envelope
  external_reference text,                    -- partner's Idempotency-Key
  cycle_due_at timestamptz,                   -- NCQA: re-credential <= 36 months
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE cycle per provider — a re-credential can't open while an
-- initial is still in flight.
CREATE UNIQUE INDEX IF NOT EXISTS credentialing_active_provider_idx
  ON credentialing_cases (provider_id)
  WHERE status IN ('intake', 'psv_in_progress', 'committee_review');

CREATE INDEX IF NOT EXISTS credentialing_cases_client_idx
  ON credentialing_cases (client_id);
CREATE INDEX IF NOT EXISTS credentialing_cases_external_ref_idx
  ON credentialing_cases (external_reference) WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS verification_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES credentialing_cases(id),
  -- element key from lib/credentialing/config.ts (identity, licensure, dea,
  -- board_certification, education_training, work_history, malpractice,
  -- sanctions_exclusions, hospital_privileges)
  element text NOT NULL,
  source text NOT NULL,                       -- caqh | npdb | oig_leie | sam_gov | abms | state_board | dea | manual
  -- pending | in_progress | verified | discrepancy | expired | not_applicable
  status text NOT NULL DEFAULT 'pending',
  detail jsonb,                               -- normalized source response ref — never raw PII blobs
  requested_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per element per cycle.
CREATE UNIQUE INDEX IF NOT EXISTS verification_items_case_element_idx
  ON verification_items (case_id, element);

CREATE TABLE IF NOT EXISTS monitoring_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  source text NOT NULL,                       -- oig_leie | sam_gov | state_board | npdb
  active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_result text,                           -- clear | hit
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS monitoring_provider_source_idx
  ON monitoring_subscriptions (provider_id, source);

-- Service-role only.

COMMENT ON TABLE providers IS 'Credentialing line: the provider entity. Provider PII handled with PHI-grade discipline.';
COMMENT ON TABLE credentialing_cases IS 'One row per credentialing/re-credentialing cycle. Decision set only by the committee path (the wall).';
COMMENT ON TABLE verification_items IS 'One PSV element per row — engine orchestrates, committee reads. See lib/credentialing/config.ts for the NCQA CR element set.';
COMMENT ON TABLE monitoring_subscriptions IS 'Continuous exclusion/license monitoring between cycles (Phase 4 worker consumes).';

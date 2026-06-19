-- Migration 028 — Billing as a product: PEPM | PMPM | per-auth, per client
--
-- Today billing is PEPM-only (018_invoices.sql). This generalizes it so
-- each client can be billed on a different model at a different rate, and
-- so we can track COGS by human labor (per-staff loaded cost).
--
-- Decisions (Jonah, 2026-06-16):
--   - Per-auth: a DENIED auth bills the same as an APPROVED auth; an APPEAL
--     is a separate billable event.
--   - Labor cost varies per hire → per-staff loaded_cost_per_hour, not a
--     global constant.
--
-- Backward compatible: existing PEPM clients default to billing_model='pepm'
-- and the existing invoices columns are retained; new columns are additive.

-- ── Clients: billing model + per-client rates ──────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'pepm'
    CHECK (billing_model IN ('pepm', 'pmpm', 'per_auth'));

-- Rates in cents to avoid float drift. Which one applies depends on
-- billing_model; the others stay null. (pepm reuses the existing
-- pepm_rate path via signup_requests/invoices; stored here too so the
-- client row is the single source of truth going forward.)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pepm_rate_cents integer
    CHECK (pepm_rate_cents IS NULL OR pepm_rate_cents >= 0),
  ADD COLUMN IF NOT EXISTS pmpm_rate_cents integer
    CHECK (pmpm_rate_cents IS NULL OR pmpm_rate_cents >= 0),
  ADD COLUMN IF NOT EXISTS per_auth_rate_cents integer
    CHECK (per_auth_rate_cents IS NULL OR per_auth_rate_cents >= 0),
  -- Appeals bill separately under per-auth; own rate so it can differ.
  ADD COLUMN IF NOT EXISTS per_appeal_rate_cents integer
    CHECK (per_appeal_rate_cents IS NULL OR per_appeal_rate_cents >= 0);

COMMENT ON COLUMN clients.billing_model IS
  'How this client is invoiced: pepm (per employee per month), pmpm (per member per month), or per_auth (per authorization). Rate is read from the matching *_rate_cents column.';

-- ── Invoices: generalize beyond PEPM ───────────────────────────────────────
--
-- Keep pepm_rate_cents / member_count for the existing PEPM rows + history.
-- Add a model discriminator, a generic quantity/unit-rate pair, and an
-- auth-count breakdown for per-auth invoices. total_cents stays the
-- authoritative billed amount.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'pepm'
    CHECK (billing_model IN ('pepm', 'pmpm', 'per_auth'));

ALTER TABLE invoices
  -- Generic line basis: quantity * unit_rate_cents = the model's core charge.
  --   pepm  → quantity = employee count
  --   pmpm  → quantity = member count
  --   per_auth → quantity = billable auth count
  ADD COLUMN IF NOT EXISTS billable_quantity integer
    CHECK (billable_quantity IS NULL OR billable_quantity >= 0),
  ADD COLUMN IF NOT EXISTS unit_rate_cents integer
    CHECK (unit_rate_cents IS NULL OR unit_rate_cents >= 0),
  -- Per-auth breakdown (so the invoice explains itself; denied bills same
  -- as approved, appeals counted + charged separately).
  ADD COLUMN IF NOT EXISTS auth_count integer
    CHECK (auth_count IS NULL OR auth_count >= 0),
  ADD COLUMN IF NOT EXISTS appeal_count integer
    CHECK (appeal_count IS NULL OR appeal_count >= 0),
  ADD COLUMN IF NOT EXISTS appeal_rate_cents integer
    CHECK (appeal_rate_cents IS NULL OR appeal_rate_cents >= 0),
  -- Captured COGS at generation time (labor) so margin is a snapshot, not a
  -- moving target. Computed from per-staff loaded rates × minutes/auth.
  ADD COLUMN IF NOT EXISTS cogs_labor_cents bigint
    CHECK (cogs_labor_cents IS NULL OR cogs_labor_cents >= 0);

-- The existing pepm_rate_cents column is NOT NULL from migration 018; new
-- non-PEPM invoices must still satisfy it. Relax to allow null for
-- pmpm/per_auth rows (PEPM rows keep populating it).
ALTER TABLE invoices ALTER COLUMN pepm_rate_cents DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN member_count DROP NOT NULL;

COMMENT ON COLUMN invoices.billable_quantity IS
  'Model-agnostic line quantity: employees (pepm), members (pmpm), or billable auths (per_auth). quantity * unit_rate_cents is the core charge; per-auth invoices add appeal_count * appeal_rate_cents.';
COMMENT ON COLUMN invoices.cogs_labor_cents IS
  'Snapshot of human-labor COGS for the period (concierge + clinician minutes valued at per-staff loaded rates). Revenue total_cents minus this is the period margin.';

-- ── Staff: per-hire loaded cost for COGS ───────────────────────────────────

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS loaded_cost_per_hour_cents integer
    CHECK (loaded_cost_per_hour_cents IS NULL OR loaded_cost_per_hour_cents >= 0);

COMMENT ON COLUMN staff.loaded_cost_per_hour_cents IS
  'Fully-loaded labor cost per hour for this hire (salary + benefits + overhead), in cents. Varies per hire. Multiplied by minutes worked per auth to compute COGS.';

-- ── Per-case labor capture (the COGS raw signal) ───────────────────────────
--
-- One row per (case, staff) work session. The pipeline timer and the
-- concierge touchpoint log feed this; COGS rolls it up against each
-- staff member's loaded rate.

CREATE TABLE IF NOT EXISTS case_labor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id),
  -- What kind of work: concierge first-call, clinician review, appeal, etc.
  activity text NOT NULL
    CHECK (activity IN ('concierge_intake', 'concierge_followup', 'clinician_review', 'clinician_deepdive', 'appeal_work', 'other')),
  minutes numeric(8,2) NOT NULL CHECK (minutes >= 0),
  -- Snapshot the rate so historical COGS doesn't shift when a rate changes.
  loaded_cost_per_hour_cents integer
    CHECK (loaded_cost_per_hour_cents IS NULL OR loaded_cost_per_hour_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_case_labor_entries_case ON case_labor_entries(case_id);
CREATE INDEX IF NOT EXISTS idx_case_labor_entries_staff ON case_labor_entries(staff_id);

ALTER TABLE case_labor_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to case_labor_entries"
  ON case_labor_entries FOR ALL USING (true);

COMMENT ON TABLE case_labor_entries IS
  'Per-case human-labor time entries (minutes by staff + activity). Rolled up against staff loaded rates to compute COGS per auth and margin per client.';

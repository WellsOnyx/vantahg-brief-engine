-- Migration 027 — Review training dataset (de-identified)
--
-- A consolidated, HIPAA Safe Harbor de-identified record of every completed
-- medical review, captured automatically at determination finalization so
-- VantaUM can train its own clinical-decision model on its own reviewers'
-- decisions ("our own fallback replacement based on our own reviews of the
-- same cases").
--
-- WHAT THIS TABLE IS / IS NOT
--   - `payload` stores ONLY de-identified data. The Safe Harbor scrub runs at
--     capture time (lib/deident/safe-harbor.ts) BEFORE the row is written.
--     Raw PHI never lands here — it stays on `cases`.
--   - `case_id` is retained as an internal linkage + idempotency key. It is a
--     random UUID, lives inside the same service-role trust boundary as
--     `cases`, is RLS-restricted to internal staff, and is STRIPPED from every
--     exported artifact (the export projects `sample_ref`, never `case_id`).
--
-- One row per case (UNIQUE on case_id). Re-running capture after a physician
-- feedback / re-determination UPSERTs, so the label always reflects the latest
-- human decision.

CREATE TABLE IF NOT EXISTS review_training_samples (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Internal linkage only. Never exported. See header.
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,

  -- Stable pseudonymous identifier that appears in the EXPORT in place of
  -- case_id. Derived deterministically (salted hash of case_id) so re-captures
  -- map to the same ref without exposing the case UUID.
  sample_ref text NOT NULL,

  -- Non-PHI classification, denormalized for cheap filtering / stratified
  -- sampling when building the training set.
  case_type text,
  service_category text,
  review_type text,
  source_determination text,      -- approve | deny | partial_approve | modify | pend | <idr shape>

  -- The de-identified training sample: { inputs: {...}, label: {...}, meta }.
  payload jsonb NOT NULL,

  -- Provenance of the de-identification so a future compliance review can tell
  -- which scrub ruleset produced a given row.
  deident_method text NOT NULL DEFAULT 'safe_harbor_v1',
  contains_freetext boolean NOT NULL DEFAULT false,
  schema_version integer NOT NULL DEFAULT 1,

  CONSTRAINT unique_review_sample_case UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS idx_review_samples_created_at
  ON review_training_samples(created_at);
CREATE INDEX IF NOT EXISTS idx_review_samples_determination
  ON review_training_samples(source_determination);
CREATE INDEX IF NOT EXISTS idx_review_samples_sample_ref
  ON review_training_samples(sample_ref);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION set_review_samples_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_samples_set_updated_at ON review_training_samples;
CREATE TRIGGER review_samples_set_updated_at
  BEFORE UPDATE ON review_training_samples
  FOR EACH ROW EXECUTE FUNCTION set_review_samples_updated_at();

-- RLS: internal staff only. No TPA, provider, practice, or client access —
-- this is an internal ML asset, not customer-facing.
ALTER TABLE review_training_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff full access to review samples" ON review_training_samples;
CREATE POLICY "Internal staff full access to review samples"
  ON review_training_samples FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'slt'));

COMMENT ON TABLE review_training_samples IS
  'De-identified (HIPAA Safe Harbor) training samples, one per completed review. Captured automatically at determination finalization. payload holds only scrubbed data; case_id is internal linkage and is never exported.';
COMMENT ON COLUMN review_training_samples.case_id IS
  'Internal linkage/idempotency key. RLS-restricted to internal staff and stripped from every export. Never treat as part of the training data.';
COMMENT ON COLUMN review_training_samples.sample_ref IS
  'Pseudonymous stable id used in the exported dataset in place of case_id.';

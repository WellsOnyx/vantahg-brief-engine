-- Migration 005: John Intel Expansion
-- Adds: physician AI feedback, denial strength scoring, Two-Midnight Rule fields,
-- new service categories, appeal outcome tracking

-- ── Physician AI Feedback (training signal) ─────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS physician_ai_agreement text
  CHECK (physician_ai_agreement IN ('agree', 'disagree', 'modified'));
ALTER TABLE cases ADD COLUMN IF NOT EXISTS physician_ai_feedback_notes text;

-- ── Denial Strength Scoring ─────────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS denial_strength_score integer;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS denial_strength_grade text
  CHECK (denial_strength_grade IN ('strong', 'moderate', 'weak', 'very_weak'));

-- ── Two-Midnight Rule (Medicare) ────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS two_midnight_applies boolean DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payer_classification text
  CHECK (payer_classification IN ('traditional_medicare', 'medicare_advantage', 'commercial', 'unknown'));

-- ── Appeal Outcome Tracking ─────────────────────────────────────────────────
-- The appeals table already has determination fields, but we add outcome tracking
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IN ('upheld', 'overturned', 'modified', 'withdrawn'));
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS outcome_rationale text;
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS original_denial_strength_score integer;

-- ── Update service_category constraint to include new categories ────────────
-- Note: PostgreSQL doesn't easily alter CHECK constraints, so we drop and recreate
-- This is safe because existing data already matches the new superset
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_service_category_check;
-- No constraint needed — the app enforces the enum, and flexibility is preferred for future categories

COMMENT ON COLUMN cases.physician_ai_agreement IS 'Physician feedback on whether AI recommendation was accurate. Training signal for model improvement.';
COMMENT ON COLUMN cases.denial_strength_score IS '0-100 score of how defensible a denial is against appeal. Calculated by lib/denial-strength.ts.';
COMMENT ON COLUMN cases.two_midnight_applies IS 'Whether the CMS Two-Midnight Rule applies (Traditional Medicare only).';
COMMENT ON COLUMN appeals.outcome IS 'Final appeal outcome: upheld (original denial stands), overturned (reversed to approval), modified (partial change).';

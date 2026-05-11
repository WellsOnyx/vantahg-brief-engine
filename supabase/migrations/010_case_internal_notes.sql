-- Migration 010 — case internal notes
--
-- Adds a general-purpose internal notes field on cases for admin/reviewer
-- annotations that don't fit any of the existing tier-specific note columns
-- (lpn_review_notes, rn_review_notes, peer_to_peer_notes,
-- physician_ai_feedback_notes, determination_rationale).
--
-- Edited via POST /api/cases/[id]/edit only, which enforces a strict field
-- allowlist and writes a case_edited audit event with before/after diff.
-- Not edited via the existing PATCH /api/cases/[id] free-form route.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS internal_notes text;

COMMENT ON COLUMN cases.internal_notes IS
  'Free-text admin/reviewer notes about the case. Mutated only via /api/cases/[id]/edit with full audit trail. Distinct from lpn_review_notes / rn_review_notes which are tied to specific review tiers.';

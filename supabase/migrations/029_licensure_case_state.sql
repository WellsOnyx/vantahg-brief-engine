-- Migration 029 — Licensure case_state for production routing
--
-- Real column so licensure-matched routing works on production data, not demo seeds.
-- Populated at intake (claim jurisdiction or form data).
-- Backfill: one-time update from historical intake JSONB or external data if available.
-- See docs and operator cockpit for matching.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS case_state text;

COMMENT ON COLUMN cases.case_state IS
  'Jurisdiction/state for the case (for licensure-matched reviewer routing). Real column for prod. estimated_pending_calibration context.';

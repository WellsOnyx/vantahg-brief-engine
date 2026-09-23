-- Migration 032 — Two-line UM pricing columns (platform + clinical review)
--
-- Source: docs/customer-ready/um-unit-economics-rate-card.md
--         docs/customer-ready/um-pricing-rules.md
--         docs/customer-ready/07-billing-and-tracking.md
--
-- Additive. Plain Postgres. No auth.uid().
-- Prices live in lib/billing/um-price-card.ts, not in this file.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS route text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS billable boolean;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS bill_tier text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS charge_amount numeric;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cost_amount numeric;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS auto_reason text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS gold_card boolean;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS touch_stack text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_route_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_route_check
      CHECK (route IS NULL OR route IN ('auto', 'nurse', 'md', 'external'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_bill_tier_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_bill_tier_check
      CHECK (bill_tier IS NULL OR bill_tier IN ('auto', 'nurse', 'md', 'external'));
  END IF;
END $$;

ALTER TABLE billable_events ADD COLUMN IF NOT EXISTS line_kind text;
ALTER TABLE billable_events ADD COLUMN IF NOT EXISTS bill_tier text;
ALTER TABLE billable_events ADD COLUMN IF NOT EXISTS cost_amount numeric;
ALTER TABLE billable_events ADD COLUMN IF NOT EXISTS touch_stack text[];

ALTER TABLE billable_events DROP CONSTRAINT IF EXISTS billable_events_sku_check;
ALTER TABLE billable_events ADD CONSTRAINT billable_events_sku_check
  CHECK (sku IN (
    'prior_auth',
    'first_level_appeal',
    'rush_addon',
    'um_review',
    'um_platform'
  ));

COMMENT ON COLUMN cases.route IS
  'Final UM review tier (auto|nurse|md|external). Highest touch bills once.';
COMMENT ON COLUMN cases.touch_stack IS
  'Every review touch on the case. Invoice uses bill_tier only.';
COMMENT ON COLUMN billable_events.line_kind IS
  'legacy_sku (synthetic schedule) or um_review / um_platform (two-line card).';

-- Migration 027 — Concierge touchpoints
--
-- Every intake, regardless of channel (eFax, Gravity Rails agent, live
-- call, call center, client portal, manual entry), generates a "ping"
-- for the assigned concierge: call the requester back, build the
-- relationship, confirm what the brief engine already prepared.
--
-- This table is the log of those human touches. A case with no outbound
-- touchpoint yet is an open ping; the first logged call closes it.
-- Touchpoints are append-only — relationship history is part of the
-- service story we show TPAs.

CREATE TABLE IF NOT EXISTS concierge_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  -- Nullable: demo mode and pre-provisioning environments log calls
  -- before concierge rows exist; the audit trail still carries the actor.
  concierge_id uuid REFERENCES concierges(id),
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  channel text NOT NULL DEFAULT 'phone'
    CHECK (channel IN ('phone', 'email', 'efax', 'portal_message')),
  outcome text NOT NULL
    CHECK (outcome IN ('reached', 'voicemail', 'no_answer', 'left_message', 'scheduled_callback', 'email_sent')),
  notes text,
  -- True for the first-contact relationship call a new intake triggers.
  is_first_contact boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_concierge_touchpoints_case
  ON concierge_touchpoints(case_id);
CREATE INDEX IF NOT EXISTS idx_concierge_touchpoints_concierge
  ON concierge_touchpoints(concierge_id);
-- Open-ping resolution: "does this case have an outbound first contact yet?"
CREATE INDEX IF NOT EXISTS idx_concierge_touchpoints_first_contact
  ON concierge_touchpoints(case_id) WHERE is_first_contact = true;

ALTER TABLE concierge_touchpoints ENABLE ROW LEVEL SECURITY;

-- MVP: permissive policy matching the rest of the internal tables
-- (service-role pattern; tighten for SOC 2 wave).
CREATE POLICY "Allow all access to concierge_touchpoints"
  ON concierge_touchpoints FOR ALL USING (true);

COMMENT ON TABLE concierge_touchpoints IS
  'Human relationship touches per case. A new intake with no outbound first-contact touchpoint is an open concierge ping.';

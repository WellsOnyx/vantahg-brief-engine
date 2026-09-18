-- Migration 027 — Case spine + audit_events + versioned auth rules (Phase 1)
--
-- Source of truth: docs/customer-ready/03-auth-workflow-rules.md,
-- docs/customer-ready/04-case-object-and-views.md,
-- docs/customer-ready/10-implementation-commits.md Phase 1.
--
-- Additive and independently mergeable from AWS PR #50:
--   * Plain Postgres 15. No auth.uid(), no storage.buckets, no
--     CREATE POLICY IF NOT EXISTS.
--   * Does not rewrite cases.status / cases.case_type / cases.determination
--     (those remain the UM + IDR constraints).
--   * 04 `type` is stored as workflow_type because case_type is already
--     um | payer_idr.
--   * 04 `determination` is stored as auth_determination so 'partial' does
--     not collide with the existing partial_approve check.
--
-- RDS path: this file is portable. After PR #50 merges, lib/db/rds-migrations.ts
-- will pick it up from supabase/migrations/ (no RDS override needed). Until
-- then, operators applying infra-aws/rds-migrations/ by prefix can use the
-- identical copy at infra-aws/rds-migrations/027_case_spine.sql.

-- ── Canonical spine columns on existing cases ─────────────────────────────

ALTER TABLE cases ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS workflow_type text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lane text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sla_status text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sla_clock text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS determined_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS auth_determination text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS signer_id text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS brief_id uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS packet_storage_keys text[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS parent_case_id uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS billable_event_id uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS fanout_status text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cm_flags text[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS audit_cursor bigint DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS open_tasks text[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS duplicate_of_case_id uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_payload jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_workflow_type_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_workflow_type_check
      CHECK (workflow_type IS NULL OR workflow_type IN ('prior_auth', 'first_level_appeal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_state_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_state_check
      CHECK (state IS NULL OR state IN (
        'received', 'intake_validated', 'intake_incomplete', 'routed',
        'briefing', 'awaiting_clinicals', 'md_queue', 'determined',
        'fanout_pending', 'fanout_complete', 'fanout_failed',
        'appeal_attached', 'closed', 'cancelled_by_client', 'withdrawn'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_lane_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_lane_check
      CHECK (lane IS NULL OR lane IN ('medical', 'pharmacy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_sla_status_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_sla_status_check
      CHECK (sla_status IS NULL OR sla_status IN ('ok', 'at_risk', 'missed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_sla_clock_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_sla_clock_check
      CHECK (sla_clock IS NULL OR sla_clock IN (
        'running', 'paused', 'stopped', 'breached', 'urgent', 'n_a', 'new_clock'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_auth_determination_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_auth_determination_check
      CHECK (auth_determination IS NULL OR auth_determination IN ('approve', 'deny', 'pend', 'partial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_fanout_status_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_fanout_status_check
      CHECK (fanout_status IS NULL OR fanout_status IN ('not_started', 'pending', 'complete', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_parent_case_id_fkey'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_parent_case_id_fkey
      FOREIGN KEY (parent_case_id) REFERENCES cases(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_duplicate_of_case_id_fkey'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_duplicate_of_case_id_fkey
      FOREIGN KEY (duplicate_of_case_id) REFERENCES cases(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cases_state ON cases(state);
CREATE INDEX IF NOT EXISTS idx_cases_workflow_type ON cases(workflow_type);
CREATE INDEX IF NOT EXISTS idx_cases_lane ON cases(lane);
CREATE INDEX IF NOT EXISTS idx_cases_sla_due_at ON cases(sla_due_at);
CREATE INDEX IF NOT EXISTS idx_cases_sla_status ON cases(sla_status);
CREATE INDEX IF NOT EXISTS idx_cases_external_id ON cases(client_id, external_id);
CREATE INDEX IF NOT EXISTS idx_cases_parent_case_id ON cases(parent_case_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_client_external_id_unique
  ON cases(client_id, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN cases.workflow_type IS
  '04 type: prior_auth | first_level_appeal. Distinct from case_type (um | payer_idr).';
COMMENT ON COLUMN cases.state IS
  '03 shared state machine. Distinct from legacy cases.status (UM/IDR).';
COMMENT ON COLUMN cases.auth_determination IS
  '04 determination: approve | deny | pend | partial. Distinct from legacy determination.';

-- ── audit_events (03 minimum schema) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_events (
  event_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid REFERENCES cases(id),
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  rule_id text,
  from_state text,
  to_state text,
  note text,
  payload_hash text NOT NULL,
  details jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_case_id ON audit_events(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_at ON audit_events(at);
CREATE INDEX IF NOT EXISTS idx_audit_events_rule_id ON audit_events(rule_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to audit_events" ON audit_events;
CREATE POLICY "Allow all access to audit_events" ON audit_events FOR ALL USING (true);

COMMENT ON TABLE audit_events IS
  'Phase 1 spine trail. Every state transition and every R01–R16 evaluation writes a row. Non-PHI notes + payload_hash only.';

-- ── auth_rules (versioned R01–R16) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id text NOT NULL,
  version int NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL,
  when_text text NOT NULL,
  then_text text NOT NULL,
  sla_clock text NOT NULL,
  effects jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version),
  CHECK (sla_clock IN ('pause', 'paused', 'resume', 'running', 'urgent', 'breached', 'stop', 'stopped', 'n_a', 'new_clock'))
);

ALTER TABLE auth_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to auth_rules" ON auth_rules;
CREATE POLICY "Allow all access to auth_rules" ON auth_rules FOR ALL USING (true);

COMMENT ON TABLE auth_rules IS
  'Versioned authorization if-this-then-that (03). Toggle enabled to turn a rule off without a code change.';

INSERT INTO auth_rules (rule_id, version, enabled, sort_order, when_text, then_text, sla_clock, effects)
VALUES
  ('R01', 1, true, 10,
   'Payload missing required fields (member id ref, DOS/procedure or Rx, requesting provider, clinicals pointer)',
   'intake_incomplete; create request_clinicals task; notify CX + client portal',
   'paused',
   '{"set_state":"intake_incomplete","set_sla_clock":"paused","add_task":"request_clinicals","notify":["cx","client_portal"]}'::jsonb),
  ('R02', 1, true, 20,
   'Clinicals received after R01',
   'Resume clock; → routed',
   'running',
   '{"set_state":"routed","set_sla_clock":"running"}'::jsonb),
  ('R03', 1, true, 30,
   'Benefit type = pharmacy/drug (config)',
   'Route lane=pharmacy',
   'running',
   '{"set_lane":"pharmacy"}'::jsonb),
  ('R04', 1, true, 40,
   'Benefit type = medical',
   'Route lane=medical',
   'running',
   '{"set_lane":"medical"}'::jsonb),
  ('R05', 1, true, 50,
   'Duplicate of open case (same client keys)',
   'Link duplicate; do not double-bill; notify CX',
   'n_a',
   '{"link_duplicate":true,"notify":["cx"]}'::jsonb),
  ('R06', 1, true, 60,
   'Urgent flag per client config',
   'Set sla_hours_urgent; priority boost in MD queue',
   'urgent',
   '{"set_priority":"urgent","set_sla_clock":"urgent"}'::jsonb),
  ('R07', 1, true, 70,
   'Criteria engine: clear meet',
   'Draft approve brief → md_queue (MD confirm required at go-live)',
   'running',
   '{"set_state":"md_queue","set_sla_clock":"running"}'::jsonb),
  ('R08', 1, true, 80,
   'Criteria engine: clear fail',
   'Draft deny brief + alt if any → md_queue',
   'running',
   '{"set_state":"md_queue","set_sla_clock":"running"}'::jsonb),
  ('R09', 1, true, 90,
   'Criteria engine: gray / insufficient evidence',
   'Draft pend or gray brief → md_queue; optional clinical request',
   'running',
   '{"set_state":"md_queue","set_sla_clock":"running"}'::jsonb),
  ('R10', 1, true, 100,
   'No MD action within 50% SLA',
   'Escalation L1: CX ping reviewer',
   'running',
   '{"notify":["cx"],"add_task":"escalation_l1"}'::jsonb),
  ('R11', 1, true, 110,
   'No MD action within 80% SLA',
   'Escalation L2: CX + client contact (status only)',
   'running',
   '{"notify":["cx","client_status"],"add_task":"escalation_l2"}'::jsonb),
  ('R12', 1, true, 120,
   'SLA breach',
   'Escalation L3: CX owner + ops; mark sla_missed',
   'breached',
   '{"set_sla_status":"missed","set_sla_clock":"breached","notify":["cx_owner","ops"],"add_task":"escalation_l3"}'::jsonb),
  ('R13', 1, true, 130,
   'MD signs',
   '→ determined; enqueue fan-out; create billable event',
   'stopped',
   '{"set_state":"determined","set_sla_clock":"stopped","enqueue_fanout":true,"create_billable_event":true}'::jsonb),
  ('R14', 1, true, 140,
   'Inbound is first-level appeal',
   'Attach prior auth case id; type=first_level_appeal; load prior package → briefing',
   'new_clock',
   '{"set_state":"briefing","start_new_clock":true}'::jsonb),
  ('R15', 1, true, 150,
   'Client cancels / withdraws',
   '→ cancelled/withdrawn; no billable if before brief start',
   'stopped',
   '{"set_sla_clock":"stopped"}'::jsonb),
  ('R16', 1, true, 160,
   'CM-relevant outcome flags (see 09)',
   'Attach flags on determination; enqueue CM handoff',
   'n_a',
   '{"attach_cm_flags":true}'::jsonb)
ON CONFLICT (rule_id, version) DO NOTHING;

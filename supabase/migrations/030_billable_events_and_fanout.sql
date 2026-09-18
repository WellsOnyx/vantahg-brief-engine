-- Migration 030 — Billable events + fan-out artifacts (Phase 4)
--
-- Source of truth: docs/customer-ready/05-determination-fanout.md,
-- docs/customer-ready/07-billing-and-tracking.md,
-- docs/customer-ready/10-implementation-commits.md Phase 4.
--
-- Memory-backed path in lib/billing + lib/fanout remains the demo/test SoR.
-- This file is the RDS catalog entry. Plain Postgres 15. No auth.uid().
-- RDS copy: infra-aws/rds-migrations/030_billable_events_and_fanout.sql (identical).

CREATE TABLE IF NOT EXISTS billable_events (
  billable_event_id uuid PRIMARY KEY,
  case_id text NOT NULL,
  client_id text NOT NULL,
  sku text NOT NULL CHECK (sku IN ('prior_auth', 'first_level_appeal', 'rush_addon')),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  occurred_at timestamptz NOT NULL,
  invoice_id text,
  statement_id text,
  status text NOT NULL CHECK (status IN ('open', 'invoiced', 'void')),
  void_reason text,
  voided_by text
);

CREATE INDEX IF NOT EXISTS idx_billable_events_client_status
  ON billable_events(client_id, status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_billable_events_case
  ON billable_events(case_id);

CREATE TABLE IF NOT EXISTS billing_statements (
  statement_id uuid PRIMARY KEY,
  client_id text NOT NULL,
  client_name text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  event_ids text[] NOT NULL DEFAULT '{}',
  subtotal numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  html text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_statements_client
  ON billing_statements(client_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS fanout_attempts (
  attempt_id uuid PRIMARY KEY,
  case_id text NOT NULL,
  target text NOT NULL,
  attempt int NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  status int,
  error text
);

CREATE INDEX IF NOT EXISTS idx_fanout_attempts_case
  ON fanout_attempts(case_id, at);

CREATE TABLE IF NOT EXISTS cx_tasks (
  task_id uuid PRIMARY KEY,
  case_id text NOT NULL,
  client_id text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cx_tasks_open
  ON cx_tasks(status, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_intents (
  intent_id uuid PRIMARY KEY,
  case_id text NOT NULL,
  channel text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  reason text NOT NULL,
  destination text,
  subject text
);

ALTER TABLE billable_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fanout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to billable_events" ON billable_events;
CREATE POLICY "Allow all access to billable_events"
  ON billable_events FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to billing_statements" ON billing_statements;
CREATE POLICY "Allow all access to billing_statements"
  ON billing_statements FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to fanout_attempts" ON fanout_attempts;
CREATE POLICY "Allow all access to fanout_attempts"
  ON fanout_attempts FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to cx_tasks" ON cx_tasks;
CREATE POLICY "Allow all access to cx_tasks"
  ON cx_tasks FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to outbound_intents" ON outbound_intents;
CREATE POLICY "Allow all access to outbound_intents"
  ON outbound_intents FOR ALL USING (true);

COMMENT ON TABLE billable_events IS
  'Phase 4 ledger. Created on MD sign (R13). Never delete; void with reason.';
COMMENT ON TABLE billing_statements IS
  'Phase 4 monthly statement stub. Groups open events per client.';
COMMENT ON TABLE fanout_attempts IS
  'Phase 4 webhook/portal delivery attempts. 8× exponential then fanout_failed.';
COMMENT ON TABLE cx_tasks IS
  'Phase 4 CX work items. resolve_fanout opens when webhook retries exhaust.';
COMMENT ON TABLE outbound_intents IS
  'Phase 4 demo-safe outbound record. Email is recorded unless ENABLE_AWS_EMAIL=true.';

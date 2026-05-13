-- RDS-compatible finisher for supabase/migrations/007_email_intake.sql.
--
-- The original migration created email_queue (which landed cleanly) then
-- failed on its policies and the allowed_sender_domains table. This
-- patch creates the missing table + policies using standard Postgres
-- syntax. References to auth.role() / auth.jwt() are replaced with the
-- session-GUC helpers from rds-migrations/001_auth_rls.sql.
--
-- Idempotent: every CREATE uses IF NOT EXISTS or is wrapped in DROP/CREATE.

-- ── email_queue policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS email_queue_service_all ON email_queue;
CREATE POLICY email_queue_service_all ON email_queue
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_queue_staff_select ON email_queue;
CREATE POLICY email_queue_staff_select ON email_queue
  FOR SELECT
  USING (get_user_role() IN ('admin', 'reviewer'));

-- The trigger may or may not exist depending on whether the original
-- migration got that far before failing - drop-and-recreate is safe.
DROP TRIGGER IF EXISTS email_queue_updated_at ON email_queue;
CREATE TRIGGER email_queue_updated_at
  BEFORE UPDATE ON email_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── allowed_sender_domains table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS allowed_sender_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS allowed_sender_domains_domain_idx
  ON allowed_sender_domains(domain);

ALTER TABLE allowed_sender_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allowed_sender_domains_service_all ON allowed_sender_domains;
CREATE POLICY allowed_sender_domains_service_all ON allowed_sender_domains
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allowed_sender_domains_staff_select ON allowed_sender_domains;
CREATE POLICY allowed_sender_domains_staff_select ON allowed_sender_domains
  FOR SELECT
  USING (get_user_role() IN ('admin', 'reviewer'));

COMMENT ON TABLE email_queue IS 'Queue for inbound emails awaiting AI parsing and case creation. No raw PHI in metadata columns.';
COMMENT ON TABLE allowed_sender_domains IS 'Whitelist of email domains auto-trusted as belonging to a known client. Unverified senders flagged for manual review.';

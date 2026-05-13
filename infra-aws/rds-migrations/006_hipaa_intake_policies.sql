-- RDS-compatible version of the policies block from
-- supabase/migrations/006_hipaa_intake.sql.
--
-- The original used `CREATE POLICY IF NOT EXISTS` which is not valid
-- Postgres syntax (it's a Supabase-flavored extension). Standard
-- Postgres requires DROP POLICY IF EXISTS followed by CREATE POLICY.
--
-- Tables (intake_log, efax_queue) were created cleanly by the original
-- migration before the policies block failed. This script just adds
-- the policies that were missed.

DROP POLICY IF EXISTS intake_log_service_all ON intake_log;
CREATE POLICY intake_log_service_all ON intake_log
  FOR ALL TO PUBLIC USING (true);

DROP POLICY IF EXISTS efax_queue_service_all ON efax_queue;
CREATE POLICY efax_queue_service_all ON efax_queue
  FOR ALL TO PUBLIC USING (true);

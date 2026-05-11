-- Migration 013 — signup-contracts storage bucket
--
-- Holds the manually uploaded BAA / MSA / ToS PDFs that admins attach to
-- pending signup_requests rows. Private bucket — access is service-role
-- only (the upload + signed-URL routes run server-side under the service
-- key). The bucket has to exist before /api/admin/signups/[id]/contract
-- can write to it.
--
-- Phase 1.1 will replace this with DocuSign envelope IDs and this bucket
-- will be deprecated for new signups (existing files stay).

INSERT INTO storage.buckets (id, name, public)
VALUES ('signup-contracts', 'signup-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Drop any prior policies (idempotent re-run safety).
DROP POLICY IF EXISTS "Internal staff read signup contracts" ON storage.objects;
DROP POLICY IF EXISTS "Internal staff write signup contracts" ON storage.objects;

-- Internal-staff read access via authenticated clients (mostly belt-and-
-- suspenders — the API routes use the service-role key which bypasses RLS,
-- but if anyone ever wires a browser client to this bucket the policy
-- gates it to the same roles allowed on signup_requests).
CREATE POLICY "Internal staff read signup contracts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'signup-contracts'
    AND get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt')
  );

CREATE POLICY "Internal staff write signup contracts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signup-contracts'
    AND get_user_role() IN ('admin', 'builder', 'ceo', 'practice-lead', 'slt')
  );

COMMENT ON POLICY "Internal staff read signup contracts" ON storage.objects IS
  'Phase 1.0 manual contract upload bucket. API routes use service-role; this policy is for any future direct-client access.';

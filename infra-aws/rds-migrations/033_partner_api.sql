-- Migration 033 (RDS variant) — Partner API v1 (B2B2C read/write)
-- Identical to supabase/migrations/033_partner_api.sql except RLS is omitted
-- (RDS connects as vantaum_admin; no client-key role exists to deny).
--
-- The implementation spine for partner systems (a TPA's EHR / claims
-- platform) to push cases in and receive decisions back programmatically.
-- Two pieces:
--
--   1. partner_api_keys — per-partner credentials, hashed at rest, scoped
--      to exactly one client tenant. Replaces the flat EXTERNAL_API_KEYS
--      env list (which had no tenant binding and an accept-anything hole
--      when unset).
--   2. partner_webhook_deliveries — the outbound event queue (decision-out).
--      Same claim-batch + FOR UPDATE SKIP LOCKED + backoff + dead-letter
--      chassis as the eFax pipeline, pointed outward.

-- ---------------------------------------------------------------------------
-- Partner credentials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL,                       -- human label, e.g. "Optum claims bridge (prod)"
  key_hash text NOT NULL UNIQUE,            -- SHA-256 hex of the API key; plaintext never stored
  key_prefix text NOT NULL,                 -- first 8 chars, for support/identification only
  scopes text[] NOT NULL DEFAULT ARRAY['submit','read'],
  -- Decision-out: where to POST case events, signed with webhook_secret
  -- (v1.1 recipe: HMAC-SHA256 over `${ts}.${body}`, X-VUM-Signature/X-VUM-Timestamp).
  webhook_url text,
  webhook_secret text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS partner_api_keys_client_idx ON partner_api_keys (client_id);

-- ---------------------------------------------------------------------------
-- Outbound event deliveries (decision-out queue)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS partner_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_key_id uuid NOT NULL REFERENCES partner_api_keys(id),
  case_id uuid NOT NULL REFERENCES cases(id),
  event_type text NOT NULL,                 -- case.determination | case.status_changed
  payload jsonb NOT NULL,
  -- pending | processing | delivered | dead_letter
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS partner_webhook_deliveries_pending_idx
  ON partner_webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS partner_webhook_deliveries_case_idx
  ON partner_webhook_deliveries (case_id);

-- Claim a batch for delivery — clone of claim_efax_batch semantics:
-- concurrent workers never double-claim (SKIP LOCKED); crashed workers'
-- rows self-release after 10 minutes.
CREATE OR REPLACE FUNCTION claim_partner_webhook_batch(worker_id text, batch_size integer)
RETURNS SETOF partner_webhook_deliveries AS $$
  UPDATE partner_webhook_deliveries d
  SET status = 'processing', locked_at = now(), locked_by = worker_id
  WHERE d.id IN (
    SELECT id FROM partner_webhook_deliveries
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
    ORDER BY next_attempt_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
$$ LANGUAGE sql;

-- Service-role only.

COMMENT ON TABLE partner_api_keys IS 'Partner API v1 credentials — hashed keys scoped to one client tenant. See docs/PARTNER_API.md.';
COMMENT ON TABLE partner_webhook_deliveries IS 'Outbound partner event queue (decision-out) — claim-batch worker with backoff + dead-letter.';

-- Partner's own reference for the case (set from the Idempotency-Key at
-- submit) — echoed back in every read and webhook event so the partner
-- can correlate without storing our case_id.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS external_reference text;
CREATE INDEX IF NOT EXISTS idx_cases_external_reference
  ON cases (external_reference) WHERE external_reference IS NOT NULL;

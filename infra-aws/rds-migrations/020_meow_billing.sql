-- Migration 020 — Meow billing integration
--
-- Adds the fields needed to track Meow's view of customers + invoices
-- alongside our own. We don't replace our own invoice rows; Meow's IDs
-- are pointers to their copy, our row is the source of truth for the
-- billing period + customer linkage.
--
-- Status model:
--   - invoices.status (our model)   - draft | sent | paid | void
--   - invoices.meow_status (Meow's) - DRAFT | OPEN | PAID | UNCOLLECTIBLE | VOID
--   The cron sync logic translates Meow's status to ours and updates
--   invoices.paid_at when Meow reports PAID.
--
-- Idempotency: re-running this migration is safe.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS meow_customer_id uuid;

CREATE INDEX IF NOT EXISTS idx_clients_meow_customer_id
  ON clients(meow_customer_id)
  WHERE meow_customer_id IS NOT NULL;

COMMENT ON COLUMN clients.meow_customer_id IS
  'Meow InvoicingCustomer UUID. Set on first invoice generation for this client. Reused for every subsequent invoice.';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS meow_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS meow_status text,
  ADD COLUMN IF NOT EXISTS meow_invoice_number text,
  ADD COLUMN IF NOT EXISTS meow_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS meow_payment_url text;

CREATE INDEX IF NOT EXISTS idx_invoices_meow_invoice_id
  ON invoices(meow_invoice_id)
  WHERE meow_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_meow_status_open
  ON invoices(meow_status)
  WHERE meow_status IN ('OPEN', 'DRAFT');

COMMENT ON COLUMN invoices.meow_invoice_id IS
  'Meow Invoice UUID. NULL when the invoice is local-only (pre-Meow integration or void). Set when generateInvoice() pushes to Meow.';
COMMENT ON COLUMN invoices.meow_status IS
  'Last-known Meow invoice status. Updated by cron sync. Our invoices.status is the canonical state for app logic; this column exists for reconciliation + debugging.';
COMMENT ON COLUMN invoices.meow_payment_url IS
  'Hosted Meow payment page URL the customer can visit to pay. Surfaced in the admin UI so support can resend the link if the email is lost.';

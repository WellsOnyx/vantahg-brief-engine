-- Migration 018 - Invoices for PEPM billing
--
-- One invoice row per client per month. Generated on the 1st of each
-- month for the previous month's lives. Status flow:
--   draft -> sent -> paid | void
--
-- Member count snapshot is taken at generation time so adjustments
-- after the fact don't retroactively change the bill.

CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  -- Billing period - first and last day of the month being billed.
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- Snapshot of pricing + volume at generation time.
  pepm_rate_cents integer NOT NULL CHECK (pepm_rate_cents >= 0),
  member_count integer NOT NULL CHECK (member_count >= 0),

  -- Pre-computed total for fast list views. Equal to pepm_rate_cents * member_count.
  total_cents bigint NOT NULL CHECK (total_cents >= 0),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'void')),

  invoice_number text NOT NULL UNIQUE,
  notes text,

  -- Lifecycle timestamps
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,

  -- PDF storage path (rendered on send)
  pdf_storage_path text,

  -- Audit
  generated_by text,  -- email of admin who generated
  sent_by text        -- email of admin who sent
);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- One invoice per client per period
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_client_period
  ON invoices(client_id, period_start);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_invoices_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoices_updated_at();

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff full access to invoices" ON invoices;
CREATE POLICY "Internal staff full access to invoices"
  ON invoices FOR ALL
  USING (get_user_role() IN ('admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead'));

COMMENT ON TABLE invoices IS
  'Monthly PEPM invoices, one row per client per period. Snapshot pepm_rate + member_count at generation so retroactive edits do not change billed amounts.';

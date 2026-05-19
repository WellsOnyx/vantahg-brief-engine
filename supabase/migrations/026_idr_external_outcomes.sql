-- Migration 026 — Add ability to track P2P and IRO outcomes on IDR cases (Task 13)

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS external_outcomes jsonb;

COMMENT ON COLUMN cases.external_outcomes IS
  'Stores outcomes from external reviews on Payer IDR cases. Example: { "p2p": { "requested": true, "status": "completed", "date": "...", "notes": "..." }, "iro": { ... } }';

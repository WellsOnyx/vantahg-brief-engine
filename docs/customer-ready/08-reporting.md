# 08 — Robust reporting (MVP that clients actually use)

## Client-facing reports (week one)

| Report | Grain | Columns (core) |
|--------|-------|----------------|
| Volume | Day / week | received, signed, open |
| Turnaround | Case | received_at → determined_at hours; p50/p90 |
| Outcomes | Case | approve / deny / pend / partial rates |
| Deny reasons | Case | normalized reason codes |
| SLA | Case | hit / miss / at_risk |

## Delivery

- Portal page (filter by date, LOB, type)
- CSV export (same columns)
- Optional scheduled email of **CSV link** (secure) — not PHI in body

## Internal / CX reports

- Account health rollup
- Hypercare first-25 scorecard
- Fan-out failure rate
- Escalation counts (R10–R12)

## v1.1 (after ledger clean)

- Cost per case (internal)
- Trend vs prior period
- CM flag frequency
- Appeal overturn vs uphold

## Non-goals

- Full BI warehouse day one
- Pixel-perfect board decks from the app (export to Sheets if needed)

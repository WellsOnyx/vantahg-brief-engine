# 07 — Track and bill

## Principle

**Case events create money events.** Do not bill from memory or spreadsheets as system of record.

**Packaging (corrected 2026-09-21):** **VantaUM sells Med Review** as the paid wedge. Ledger SKUs (`prior_auth`, `first_level_appeal`, `rush_addon`) are **usage tracking** under UM’s Vanta med-review contract — not a standalone UM storefront, and not free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Free Brief Engine access is gated by `client_config.vanta_med_review_contract` and `med_review_provider=vanta`. Entitlement gate unchanged.

**Prices (locked 2026-09-23):** do not invent a second card in this file. Canonical planning rate card: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Rules-only / auto is **not billed** (Brief Engine value). Nurse, physician/MD, and external peer **are billed**.

## Billable event

Created on R13 (MD signed), unless fee schedule says otherwise (e.g. cancel rules).

```text
billable_event_id
case_id
client_id
sku               # prior_auth | first_level_appeal | rush_addon
quantity          # 1
unit_price
currency
occurred_at
invoice_id?       # null until invoiced
status            # open | invoiced | void
```

## Tracking (ops)

Dashboard metrics from events (not guesses):

- received_count, briefed_count, signed_count, delivered_count
- TAT percentiles
- SLA hit rate
- void / cancel rate

## Invoicing (MVP)

1. Monthly job groups `open` billable events per client.
2. Generate statement (PDF + portal page).
3. Export to Stripe and/or QuickBooks.
4. Mark events `invoiced`.

**Out of scope v1:** complex proration, multi-currency, claims 837 — use export + human finance.

## Voids / disputes

- Void requires reason + approver; audit_event; never delete row.

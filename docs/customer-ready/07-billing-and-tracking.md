# 07 — Track and bill

## Principle

**Case events create money events.** Do not bill from memory or spreadsheets as system of record.

**Packaging (corrected 2026-09-21):** **VantaUM sells Med Review** as the paid wedge. Ledger SKUs (`prior_auth`, `first_level_appeal`, `rush_addon`) are **usage tracking** under UM’s Vanta med-review contract — not a standalone UM storefront, and not free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Free Brief Engine access is gated by `client_config.vanta_med_review_contract` and `med_review_provider=vanta`. Entitlement gate unchanged.

**Prices (working decision 2026-09-23):** two lines, not a review-only card. Memo: [`pricing-strategy-memo-2026-09-23.md`](pricing-strategy-memo-2026-09-23.md). Canonical card: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Rule index: [`um-pricing-rules.md`](um-pricing-rules.md). Config: `lib/billing/um-price-card.ts`. Do not publish internal margins.

1. **Platform** membership, default **$1.50 PMPM** (band $1.25–$1.75, floor $1.25). Covers the engine, criteria, intake rails, gold-card file, and reporting. Never steps down. $0 only when explicitly waived inside a fat TPA admin PEPM. Do not treat “Brief Engine included” as a $0 platform. That conflict is an open question on the rate card.
2. **Clinical review**, one tier per case: rules/auto **$0** (row still posts), nurse **$85**, MD **$200**, external **$350**. Highest touch bills once. A gold-carded provider posts at **$0** like auto (R19) and is not billable. Pricing rule R16 steps the review prices down with the trailing-90-day auto-rate. Platform never steps down. Fully loaded costs: rules $3, nurse $35, MD $80, external $280. Gold-card uses the rules cost ($3).

Legacy ledger SKUs (`prior_auth`, `first_level_appeal`, `rush_addon`) remain the synthetic usage schedule. Commercial rows are `um_review` and `um_platform`. A monthly statement drops the legacy rows for a case that already has `um_review`, so the two schedules are not added together.

## Wired path (2026-09-23)

Case close writes the card. It does not recompute a second price.

1. **Review line.** `POST /api/case-spine/[id]/review-route` with `touch` `auto|nurse|md|external` (optional `gold_card`, optional `trailing_auto_rate`) persists `route`, `billable`, `bill_tier`, `charge_amount`, `cost_amount`, `touch_stack` and upserts one `um_review` row. Auto and gold-card post at **$0** and are not billable. Highest touch updates that same row. MD sign (`POST /api/case-spine/[id]/sign`) does the same: an md touch when the current tier is below md, otherwise an upsert of the tier already on the case. Gold-card stays $0.
2. **Legacy SKUs.** `recordBillableEventsForSign` ($45 / $75 / $25) still runs for the synthetic go-live client only (`SYNTHETIC_CLIENT_ID`). Other clients get `um_review` only. The statement uses `selectCommercialLedgerRows`, so a case with `um_review` is not also billed the synthetic SKU.
3. **Platform line.** One `um_platform` row per client per month from **lives-in-month** (operator input, not the 500k planning denominator). See [`14-billing-wire.md`](14-billing-wire.md). $0 only with an explicit fat-TPA waiver (`platform_fee_waived` or `platform_waived=true`). Med Review does not waive it.
4. **Statement.** HTML/PDF and `/portal/tpa/statements` show Platform PMPM and clinical lines by tier, including $0 auto/gold-card, with PEPM/PMPM denominators labeled. The monthly cron stays synthetic-client only.
5. **Store.** `ENABLE_AWS_DB=true` writes `billable_events` through migrations 030/032. Otherwise the memory ledger. No new dollar rates.

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

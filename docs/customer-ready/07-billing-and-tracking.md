# 07 — Track and bill

## Principle

**Case events create money events.** Do not bill from memory or spreadsheets as system of record.

**Packaging (corrected 2026-09-21):** **VantaUM sells Med Review** as the paid wedge. Ledger SKUs (`prior_auth`, `first_level_appeal`, `rush_addon`) are **usage tracking** under UM’s Vanta med-review contract — not a standalone UM storefront, and not free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Free Brief Engine access is gated by `client_config.vanta_med_review_contract` and `med_review_provider=vanta`. Entitlement gate unchanged.

**Prices (superseded 2026-09-23):** two lines, not a review-only card. Canonical card: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Rule index: [`um-pricing-rules.md`](um-pricing-rules.md). Config: `lib/billing/um-price-card.ts`.

1. **Platform** membership, default **$1.50 PMPM** (band $1.25–$1.75, floor $1.25). Never steps down. $0 only when explicitly waived inside a fat TPA admin PEPM. Do not treat “Brief Engine included” as a $0 platform. That conflict is an open question on the rate card.
2. **Clinical review**, one tier per case: rules/auto **$0** (row still posts), nurse **$85**, MD **$200**, external **$350**. Highest touch bills once. Pricing rule R16 steps the review prices down with the trailing-90-day auto-rate. Fully loaded costs: rules $3, nurse $35, MD $80, external $280.

Legacy ledger SKUs (`prior_auth`, `first_level_appeal`, `rush_addon`) remain the synthetic usage schedule. Commercial rows are `um_review` and `um_platform`. A monthly statement drops the legacy rows for a case that already has `um_review`, so the two schedules are not added together.

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

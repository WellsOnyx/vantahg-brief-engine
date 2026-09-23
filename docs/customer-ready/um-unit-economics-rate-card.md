# VantaUM two-line UM price card

**Status:** LOCKED 2026-09-23. Supersedes the review-only card in PR #78. Planning case. Prices live in `lib/billing/um-price-card.ts`.

Packaging lock stays in [`01-product-boundary.md`](01-product-boundary.md). Ledger mechanics stay in [`07-billing-and-tracking.md`](07-billing-and-tracking.md). Rule index: [`um-pricing-rules.md`](um-pricing-rules.md).

## Denominators (do not mix)

| Quote | Denominator | Count |
|-------|-------------|-------|
| Broker **PEPM** | Employees | **333k** |
| CFO / stop-loss / UM vendor **PMPM** | Covered lives | **500k** |
| Inbound auths / year | Not a price denominator | **750k** |

Never print a rate that is both PEPM and PMPM without both labels.

## OPEN QUESTION — does Med Review waive platform, or only auto review?

**Does the Med Review wedge waive the $1.50 platform, or only the $0 auto review?**

Do not resolve this. Platform remains **NOT $0** under Med Review unless a fat-TPA waiver.

The packaging lock says Brief Engine / UM is included free **only** under a Vanta med-review contract. This card adds a **separate platform membership**.

- Do **not** read the packaging lock as “platform is $0 under Med Review.”
- Default platform price on this card is **$1.50 PMPM**.
- **$0 platform** is allowed only when the fee sits inside a fat TPA admin PEPM that already carries criteria + rails. No dollar threshold for “fat” was locked. Code waives platform only when a caller sets that waiver explicitly. It does not infer $0 from `vanta_med_review_contract`.

Rules/auto **review** stays $0 under the med-review contract. That is the free review line, not the platform line.

## Two fee lines

### A. Platform membership

| | |
|--|--|
| Default | **$1.50 PMPM** |
| Band | **$1.25–$1.75** |
| Floor | **$1.25** |
| $0 | Only inside a fat TPA admin PEPM carrying criteria + rails (see open question) |
| Step-down | **Never.** Auto-rate does not cut the platform fee. |

Annual planning platform: 500k × $1.50 × 12 = **$9.00M**.

### B. Clinical review, per case

Highest touch bills **once**. Touches are not stacked.

| Tier | Card charge | List band | Fully loaded cost |
|------|-------------|-----------|-------------------|
| Rules / auto | **$0** | — | **$3** |
| Nurse | **$85** | $75–$95 | **$35** |
| MD | **$200** | $175–$225 | **$80** |
| External | **$350** | cost + $50–$75 | **$280** |

External card charge $350 = cost $280 + $70, inside the list band. The ≥70% contract step-down ($315) is **below** that list band. It is still the contract price.

**Gold-card (R8, R19):** a gold-carded provider routes to auto. No review fee. `billable` is false, `charge_amount` is 0, and the review row still posts at $0 like auto. Cost on that row is the locked rules/auto cost **$3**, not a new rate. The flag sticks: a later clinical touch on that case stays $0. Intake, fax, portal, eligibility, criteria, and a gold-card pass are not billable (R3).

## Base mix on 750k inbound

| Path | Share | Volume | Charge |
|------|-------|--------|--------|
| Rules / auto | 50% | 375k | $0 |
| Nurse | 38% | 285k | $85 |
| MD | 9% | 67.5k | $200 |
| External | 3% | 22.5k | $350 |

**TODO (B10):** validate 750k inbound against the live book before staffing the 285k nurse plan.

## Base year

Exact products (unrounded dollars):

| Line | Dollars |
|------|---------|
| Platform | $9,000,000 |
| Nurse | $24,225,000 |
| MD | $13,500,000 |
| External | $7,875,000 |
| **Total revenue** | **$54,600,000** |
| Rules COGS | $1,125,000 |
| Nurse COGS | $9,975,000 |
| MD COGS | $5,400,000 |
| External COGS | $6,300,000 |
| **Variable COGS** | **$22,800,000** |
| **Contribution** | **$31,800,000** |

Deck rounding of those same lines (sum of the rounded millions, used on slides):

| Line | Deck |
|------|------|
| Platform | $9.00M |
| Nurse | $24.23M |
| MD | $13.50M |
| External | $7.88M |
| **Total revenue** | **$54.61M** |
| Variable COGS | $22.81M (1.13 + 9.98 + 5.40 + 6.30) |
| Contribution | $31.80M |

$54.61M is the sum of the rounded line millions. The unrounded dollar total is $54.60M. Do not invent a third total. Planning operating profit for the deck is **$22–26M**, midpoint **$24M**. That band was given; it is not a build-up from a cost stack beyond the variable COGS above.

## Unit rates (labeled)

| | PEPM (333k EE) | PMPM (500k lives) |
|--|----------------|-------------------|
| Platform | $2.25 | $1.50 |
| Reviews | $11.42 | $7.61 |
| Total billed | $13.67 | $9.11 |
| Variable gross | $7.97 | $5.30 |
| Planning profit | ~$6.00 | ~$4.00 |

Planning profit unit rates use the **$24M** midpoint.

## Mix sensitivity at $1.50 platform

Platform stays **$9M** in every column. Review / total / contribution / billed PMPM / billed PEPM:

| Case | Auto share | Review | Total | Contribution | PMPM | PEPM |
|------|------------|--------|-------|--------------|------|------|
| Lean | 60% | $36.1M | $45.1M | $26.7M | $7.52 | $11.29 |
| Base | 50% | $45.6M | $54.6M | $31.8M | $9.11 | $13.67 |
| Heavy | 40% | $55.2M | $64.2M | $36.9M | $10.70 | $16.07 |

**TODO:** the nurse / MD / external volume split inside lean and heavy was not restated. Do not back-solve a staffing mix from these totals. Base volumes above are the only mix that is locked.

## Contract step-down (pricing rule R16)

Trailing **90-day** auto-rate. Platform never moves.

| Trailing auto-rate | Nurse | MD | External |
|--------------------|-------|----|----------|
| 50–59% (card) | $85 | $200 | $350 |
| 60–69% | $75 | $185 | $330 |
| ≥70% | $70 | $175 | $315 |

**TODO:** below 50% has no separate band. Code uses card prices. Do not add a premium.

Auto-rate = auto_count / inbound_count after voids and duplicates are removed. Final tier is what counts (the mix is mutually exclusive). A case that later goes to a nurse is not still “auto.” A gold-card case counts as auto.

Publish the auto-rate **quarterly** (R6, R17). Target **≥55% by month 12**. If auto ≥60% then ≥70%, review fees step down per the table above. Platform never steps down.

## Quote cap and first-pass (locked, not new rates)

- **R18.** MD + external modeled cap for quotes: **12% of inbound**. Base mix is already 9% + 3%. This is a quote cap, not a per-case billing gate. Do not back-solve lean/heavy nurse-MD-external volume from the sensitivity totals.
- **R7.** First-pass approval target **≥90%**. Appeals are a cost center, not a fee center, unless the client buys the appeals module.
- **First-pass definition for the dashboard tile:** a determination approved without appeal or overturn in the first clinical pass. The case object has no single field for overturn versus first clinical pass, so the tile stays an em dash. **TODO:** compute it when that field exists.
- **R17.** Quarterly report to the group: auto-rate + first-pass + MD-rate.

## What this card does not carry forward

The review-only card’s 733k-lives illustration, vendor-retail comparison, nurse **≤18 min**, MD **≤8%** as a separate operating target, and external **≤2.5%** as a separate operating target were **not** restated. Do not keep using them as canonical. The locks that **did** come back are above: auto ≥55% by month 12, first-pass ≥90%, and MD + external **together** at a 12% quote cap.

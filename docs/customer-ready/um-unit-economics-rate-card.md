# VantaUM two-line UM price card

**Status:** Working decision 2026-09-23. Client deck runs in parallel. **Do not publish internal margins** in client materials. Lead external materials with the fee table and the 375k autos at $0 — not $54.6M.

**Label every external slide “illustrative.”**

Working decision memo: [`pricing-strategy-memo-2026-09-23.md`](pricing-strategy-memo-2026-09-23.md) (Jonah Manning, 23 September 2026). Dollar amounts below match that memo and the two-line lock already in `lib/billing/um-price-card.ts` (PR #79, gold-card follow-up PR #80). This card does not add rates.

Supersedes the review-only card in PR #78. Do not quote the retired review-only **total** ($45.61M) as company revenue. **$45.6M** on this card is the clinical **review line** only (nurse + MD + external). Platform is separate.

Packaging lock stays in [`01-product-boundary.md`](01-product-boundary.md). Ledger mechanics stay in [`07-billing-and-tracking.md`](07-billing-and-tracking.md). Rule index: [`um-pricing-rules.md`](um-pricing-rules.md).

**Client-facing sentence:** “You pay a small platform fee for the engine. You pay a review fee only when a clinician opens the chart. Auto-approvals are $0.”

## Denominators (do not mix)

| Quote | Denominator | Count |
|-------|-------------|-------|
| Broker **PEPM** | Employees | **333k** |
| CFO / stop-loss / UM vendor **PMPM** | Covered lives | **500k** |
| Inbound auths / year | Not a price denominator | **750k** |

Never print an unlabeled rate that is both PEPM and PMPM. Broker conversation is PEPM. CFO conversation is PMPM.

Planning book, locked until a live inbound file replaces it: **1.50 lives / EE** (tight vs. typical 2.0–2.4) and **1.50 auths per life · 2.25 per EE**. 1.50 auths PMPY is plausible if inbound includes prospective, concurrent, imaging, and medical-benefit specialty drug.

### If dependents run 2.2 (memo §2)

**733k lives.** Keep **750k auths** (= ~**1.02 PMPY**). Recalc **PMPM only**. Revenue unchanged. PEPM does not move with the family factor.

The memo does not publish the recalculated PMPM dollar. **TODO:** do not back into a client quote at 733k lives until that PMPM is locked. Lock the denominator before anyone quotes.

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

Covers the **engine, criteria, intake rails, gold-card file, and reporting.**

| | |
|--|--|
| Default | **$1.50 PMPM** |
| Band | **$1.25–$1.75** |
| Floor | **$1.25** |
| $0 | Only inside a fat TPA admin PEPM carrying criteria + rails (see open question) |
| Step-down | **Never.** Auto-rate does not cut the platform fee. |

Annual planning platform: 500k × $1.50 × 12 = **$9.00M**.

### B. Clinical review, per case

Highest touch bills **once**. Touches are not stacked. A review fee is charged only when a clinician opens the chart.

| Tier | Card charge | List band | Fully loaded cost |
|------|-------------|-----------|-------------------|
| Rules / auto | **$0** | — | **$3** |
| Nurse | **$85** | $75–$95 | **$35** |
| MD | **$200** | $175–$225 | **$80** |
| External | **$350** | cost + $50–$75 | **$280** |

External card charge $350 = cost $280 + $70, inside the list band. The ≥70% contract step-down ($315) is **below** that list band. It is still the contract price.

**Gold-card (R8, R19):** a gold-carded provider routes to auto. No review fee. `billable` is false, `charge_amount` is 0, and the review row still posts at $0 like auto. Cost on that row is the locked rules/auto cost **$3**, not a new rate. The flag sticks: a later clinical touch on that case stays $0. Intake, fax, portal, eligibility, criteria, and a gold-card pass are not billable (R3).

Auto is a client benefit, not a loss leader. If the auto-rate rises, platform holds and review fees step down by contract (R16). We do not get paid to stay manual.

## Base mix on 750k inbound

| Path | Share | Volume | Charge | Client spend (memo rounding) |
|------|-------|--------|--------|------------------------------|
| Rules / auto | 50% | 375k | $0 | $0 |
| Nurse | 38% | 285k | $85 | $24.2M |
| MD | 9% | 67.5k | $200 | $13.5M |
| External | 3% | 22.5k | $350 | $7.9M |

About half of inbound auths generate no review fee. Show the **375k** autos at **$0** as volume.

**Staffing note (memo §2, B10):** 285k annual nurse reviews ≈ **~43 FTE** at ≤18-minute handle time. Validate inbound **by service category** before building that capacity. First build task is a service-category inbound file, not nurse hiring.

## Base year

Exact products (unrounded dollars). These are the locked products. The memo rounds the same year to **$54.6M**.

| Line | Dollars |
|------|---------|
| Platform | $9,000,000 |
| Nurse | $24,225,000 |
| MD | $13,500,000 |
| External | $7,875,000 |
| **Review line** | **$45,600,000** |
| **Total revenue** | **$54,600,000** |
| Rules COGS | $1,125,000 |
| Nurse COGS | $9,975,000 |
| MD COGS | $5,400,000 |
| External COGS | $6,300,000 |
| **Variable COGS** | **$22,800,000** |
| **Contribution** | **$31,800,000** |

Deck rounding of those same lines (sum of the rounded millions, used when a slide prints each line):

| Line | Deck |
|------|------|
| Platform | $9.00M |
| Nurse | $24.23M |
| MD | $13.50M |
| External | $7.88M |
| **Total revenue** | **$54.61M** |
| Variable COGS | $22.81M (1.13 + 9.98 + 5.40 + 6.30) |
| Contribution | $31.80M |

$54.61M is the sum of the rounded line millions. The unrounded dollar total is $54,600,000, which the memo writes as **$54.6M**. The memo’s client-spend column rounds nurse to **$24.2M** and external to **$7.9M**. Do not invent another total. Do not lead external materials with $54.6M.

### Internal economics — do not put in the client deck

| Line | Amount |
|------|--------|
| Revenue | $54.6M |
| Variable clinical + intake COGS | $22.8M |
| Contribution after variable | $31.8M |
| Criteria + residual intake / licenses (planning) | **$2–5M** |
| Planning operating profit | **$22–26M**, midpoint **~$24M** |
| Planning profit per unit | **~$6.00 PEPM / ~$4.00 PMPM** |

Criteria licenses are **required COGS**, not optional. The **$2–5M** band is that planning residual. It is not a second client fee and it is not folded into the $22.8M variable COGS. Get a vendor quote before treating $24M as a forecast. Split of MCG/InterQual out of the fully loaded path cost ($3 / $35 / $80 / $280) is still **TODO**. The planning-profit band was given. It is not a build-up that has to foot against $2–5M inside this card.

### Vendor retail comparison (internal / advisor deck)

Same **375k billable** cases at **$150 / $300 / $400 ≈ $70M+** vs VantaUM review line **$45.6M**. Platform **$9M** stays separate. The price card sits 30–40% under that vendor stack. Fully loaded unit costs underwritten here: auto $3 · nurse $35 · MD $80 · external $280.

This comparison is for the advisor / Claude deck (deck rule D4). It is not client-facing lead copy and it is not a margin slide for the client.

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

Platform stays **$9M** in every column. From memo §6. Illustrative.

| Case | Auto share | Review | Total | Variable COGS | Contribution | PMPM | PEPM |
|------|------------|--------|-------|---------------|--------------|------|------|
| Lean | 60% | $36.1M | $45.1M | $18.4M | $26.7M | $7.52 | $11.29 |
| Base | 50% | $45.6M | $54.6M | $22.8M | $31.8M | $9.11 | $13.67 |
| Heavy | 40% | $55.2M | $64.2M | $27.3M | $36.9M | $10.70 | $16.07 |

**TODO:** the nurse / MD / external volume split inside lean and heavy is not in the memo. Do not back-solve a staffing mix from these totals. Base volumes above are the only mix that is locked.

## Operating targets (canonical, memo §8)

Internal. These targets are restored. They are not “unrestated,” and they are not optional color on the card.

| Metric | Target |
|--------|--------|
| Auto-approval | **≥55% by month 12** |
| Nurse handle time | **≤18 minutes** |
| MD share of inbound | **≤8%** |
| External share of inbound | **≤2.5%** |
| First-pass approval | **≥90%** |

MD ≤8% and external ≤2.5% are operating targets. The **12%** figure is a separate quote cap on modeled MD + external together (R12, R18). Do not collapse those into one sentence.

## Contract step-down (pricing rule R16)

Trailing **90-day** auto-rate. Platform never moves.

| Trailing auto-rate | Nurse | MD | External |
|--------------------|-------|----|----------|
| 50–59% (card) | $85 | $200 | $350 |
| 60–69% | $75 | $185 | $330 |
| ≥70% | $70 | $175 | $315 |

**TODO:** below 50% has no separate band. Code uses card prices. Do not add a premium. This note is not pricing rule R13.

Auto-rate = auto_count / inbound_count after voids and duplicates are removed (B3). Final tier is what counts (the mix is mutually exclusive). A case that later goes to a nurse is not still “auto.” A gold-card case counts as auto.

Publish the auto-rate **quarterly** (R6, R17). Target **≥55% by month 12**. If auto ≥60% then ≥70%, review fees step down per the table above. Platform never steps down. A rising auto-rate is the product working, not a broken forecast.

## Quote cap and first-pass (locked, not new rates)

- **R12 / R18.** MD + external modeled cap for client quotes: **12% of inbound**. Base mix is already 9% + 3%. Quote model only. Not a per-case billing gate. Constant: `MD_EXTERNAL_QUOTE_CAP`. Do not back-solve lean/heavy nurse-MD-external volume from the sensitivity totals.
- **R7 / operating target.** First-pass approval **≥90%**. Appeals are a cost center, not a fee center, unless the client buys the appeals module.
- **First-pass definition for the dashboard tile:** a determination approved without appeal or overturn in the first clinical pass. The case object has no single field for overturn versus first clinical pass, so the tile stays an em dash. **TODO:** compute it when that field exists.
- **R17.** Quarterly report to the group: auto-rate + first-pass + MD-rate.

## Go-to-market (docs only, memo §9)

- **Buyer:** the self-funded employer, or the TPA that already owns the group.
- **Faster channel:** TPA white-label. Do not ask a TPA to give up claims, network, or stop-loss.
- **Broker** conversation is **PEPM**. **CFO** conversation is **PMPM**. Never mix unlabeled denominators.
- UM does not fit inside a **$12 PEPM** all-in TPA admin fee. Claims, network, IDR, and credentialing stay on a separate admin line (D6).

## Risks (memo §10)

Deck rule D7 uses two bullets only:

1. Auto-rate success shrinks review revenue. Every +10 points of auto-rate drops ~$7–9M of review revenue and only ~$1M of cost. Platform does not move. That is the hedge.
2. **750k inbound is an assumption.** The live book must confirm PMPY by service category before capacity is built.

Advisor note, not a third client-deck bullet: if the live book is **400k inbound**, review revenue is ~**$24M** and planning profit is ~**$6–8M plus platform**.

Family factor stays tight (1.50 lives/EE vs typical 2.0–2.4). If the book is 2.2, PMPM falls and PEPM does not. See the 733k note above.

# UM pricing rules — Claude handoff

**Working decision 2026-09-23.** Client deck runs in parallel. **Do not publish internal margins** in client materials. Lead external materials with the fee table and the 375k autos at $0 — not $54.6M. Label every external slide “illustrative.”

Working decision memo: [`pricing-strategy-memo-2026-09-23.md`](pricing-strategy-memo-2026-09-23.md) (Jonah Manning, 23 September 2026). Canonical dollars: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Code: `lib/billing/um-price-card.ts`.

This follow-up restores what the PR #80 rule prose dropped or renumbered. Dollar amounts are unchanged from PR #79 / #80.

Pricing rules R1–R20 are **not** auth-workflow R01–R16 in `lib/case-spine/rules-catalog.ts` and **not** auth-workflow R10–R14 in [`03-auth-workflow-rules.md`](03-auth-workflow-rules.md). Do not merge the catalogs. Commercial R10–R13 below are Jonah’s pricing rules. Case-spine R10–R13 (SLA escalation and MD sign) stay where they are.

## Product rules R1–R9

| ID | Rule |
|----|------|
| R1 | Two fee lines: Platform PMPM + Clinical review per case when a human opens the chart. Never one blended per-auth price. Platform covers the engine, criteria, intake rails, gold-card file, and reporting. |
| R2 | Rules-only/auto $0 review. Auto is a client benefit, not a loss leader. Charge is $0. Callers cannot override it. Guard: `assertNoAutoReviewFee` (`r2_auto_review_fee`). The row still posts. |
| R3 | BILLABLE only if Nurse, Physician/MD, or External peer fires. Intake/fax/portal/eligibility/criteria/gold-card pass = NOT billable. |
| R4 | Charge the highest clinical tier that touched, once. Nurse → MD → external = bill external only. Exception: a published add-on for a second distinct external specialty. No add-on dollar was locked. Do not invent one. Code does not bill that add-on. |
| R5 | Auto-rate up = a product win, not a revenue win. The contract must not punish the client for a higher auto-rate. The contract must not force VantaUM to staff like a review mill. A rising auto-rate is not a broken forecast. |
| R6 | Publish the auto-rate quarterly. Operating target: auto-approval **≥55% by month 12**. If auto ≥60% then ≥70%, review fees step down per R16. |
| R7 | First-pass approval **≥90%** (operating target, memo §8). Appeals = a cost center, not a fee center, unless the client buys the appeals module. **First-pass (dashboard intent):** a determination approved without appeal or overturn in the first clinical pass. The case object has no single overturn / first-clinical-pass field, so the tile stays an em dash. **TODO:** compute the tile when that field exists. |
| R8 | Gold-card / high-performing providers route to auto. No review fee. |
| R9 | AI may recommend and auto-approve against locked criteria. AI may not deny medical necessity without clinician review. Guard: `assertAiCannotDenyMedicalNecessity` (`r9_ai_deny_mn`). Other deny reason codes are not this rule. |

## R10–R13

Restored to Jonah’s original meanings. The PR #80 file had remapped these four labels onto denominators, the auto-rate formula, criteria COGS, and the below-50% band. Those notes stay in the docs. They are not R10–R13.

| ID | Rule |
|----|------|
| R10 | Do not bill rules-only. The auto row still itemizes at $0 (R2, R15). Do not charge it. |
| R11 | Do not bill a platform fee AND a review fee for the same auto case. Platform = membership. Review = labor. The auto row still posts at $0. The platform line is the membership, not a second charge on that case. |
| R12 | Cap modeled MD + external at **12% of inbound** in client quotes. Quote model only. Not a per-case billing gate. Same cap as R18. Constant: `MD_EXTERNAL_QUOTE_CAP`. |
| R13 | Per-case is the default for mid-market self-funded. PMPM-only UM is an alternate quote, not the headline. |

Kept elsewhere, not under these labels:

- Denominators (333k EE / 500k lives / 750k inbound) — denominators section below, and the rate card.
- Auto-rate = auto_count / inbound_count, voids and duplicates out, final route counts — **B3**.
- Criteria is required fully loaded path cost, not a second fee — **B5**. Planning band for criteria + residual intake / licenses is **$2–5M** (required COGS, not optional). Variable COGS **$22.8M** stays separate.
- Below 50% trailing auto-rate there is no separate band. Card prices apply. Do not add a premium — step-down **TODO** under R16. Not R13.

## Contract rules R14–R20

| ID | Rule |
|----|------|
| R14 | Two-line invoice: Platform PMPM + Clinical reviews. |
| R15 | Auto-approvals are itemized at $0 so the client sees the gift. |
| R16 | Step-downs (already in code), trailing 90-day auto-rate. 50–59% card as written (nurse $85 / MD $200 / external $350). 60–69% nurse $75 / MD $185 / external $330. ≥70% nurse $70 / MD $175 / external $315. **Platform never steps down.** Config: `UM_PRICE_CARD.stepDown`. |
| R17 | Quarterly auto-rate + first-pass + MD-rate report to the group. |
| R18 | MD + external modeled cap for quotes: 12% of inbound. Quote model only. Not a per-case billing gate. Base mix is 9% MD + 3% external = 12%. Same commercial cap as R12. Constant: `MD_EXTERNAL_QUOTE_CAP`. |
| R19 | No review fee on gold-carded providers. `gold_card` ⇒ `billable` false, `charge_amount` 0, route and bill tier `auto`. The review row still posts at $0, like auto. Cost is the locked rules/auto cost ($3), not a new rate. The flag sticks: a later clinical touch on that case stays $0. Guard: `assertNoGoldCardReviewFee` (`r19_gold_card_review_fee`). |
| R20 | Denials that are AI-only are prohibited. A clinician is required. Same guard as R9 for medical-necessity denials. |

## Operating targets (canonical, memo §8)

Internal. Restored. Do not describe these as “not restated.”

| Metric | Target |
|--------|--------|
| Auto-approval | ≥55% by month 12 |
| Nurse handle time | ≤18 minutes |
| MD share of inbound | ≤8% |
| External share of inbound | ≤2.5% |
| First-pass approval | ≥90% |

MD ≤8% and external ≤2.5% are operating targets. They are not the R12/R18 quote cap. That cap is MD + external **together** at 12% of inbound in client quotes.

## Denominators

333k EE / 500k lives / 750k inbound. Never blend unlabeled PEPM and PMPM. Broker quotes are PEPM on 333k employees. CFO, stop-loss, and UM vendor quotes are PMPM on 500k lives. 750k is annual inbound volume, not a price denominator.

**733k lives planning note (memo §2):** if dependents run 2.2 → 733k lives. Keep 750k auths (= ~1.02 PMPY). Recalc PMPM only. Revenue unchanged. The memo does not publish that recalculated PMPM dollar. **TODO:** do not back into a client quote until it is locked. 1.50 lives/EE is tight vs typical 2.0–2.4. If the book is 2.2, PMPM falls and PEPM does not. Lock the denominator before anyone quotes.

## Go-to-market (docs only, memo §9)

- Buyer: the self-funded employer, or the TPA that already owns the group.
- TPA white-label is the faster channel. Do not ask a TPA to give up claims, network, or stop-loss.
- Broker = PEPM. CFO = PMPM.
- Client-facing sentence (D1): “You pay a small platform fee for the engine. You pay a review fee only when a clinician opens the chart. Auto-approvals are $0.”

## OPEN QUESTION

**Does the Med Review wedge waive the $1.50 platform, or only the $0 auto review?**

Platform remains **NOT $0** under Med Review unless a fat-TPA waiver. Code waives platform only when a caller sets that waiver explicitly. It does not infer $0 from `vanta_med_review_contract`. No dollar threshold for “fat” was locked. Do not resolve this question in copy or in code.

Rules/auto **review** stays $0. That is the free review line, not the platform line.

## Build B1–B10

| ID | What landed |
|----|-------------|
| B1 | Case fields: `route`, `billable`, `bill_tier`, `charge_amount`, `cost_amount`, `auto_reason`, `gold_card`, plus `touch_stack`. |
| B2 | `buildTwoLineInvoice`: platform PMPM × lives-in-month + one review line per tier. Auto and gold-card post at $0. |
| B3 | `trailingAutoRate`: auto_count / inbound_count. Voids (`withdrawn`, `cancelled_by_client`) and `duplicate_of_case_id` are out of both counts. A gold-card case counts as auto (R8, R19). A case that later goes to a nurse is not still auto. |
| B4 | Touch stack is stored. One `um_review` ledger row is updated to the billed tier. Gold-card keeps the stack and bills auto at $0. |
| B5 | `requireCriteriaCogs` is required before a review line prices. It returns the fully loaded path cost. It does not add a second criteria fee. Criteria + residual intake / licenses are a **$2–5M** planning band (required COGS, not optional), kept separate from variable COGS $22.8M. Split of MCG/InterQual out of the path cost is **TODO**. |
| B6 | Ops scoreboard tiles: inbound, auto %, nurse %, MD %, external %, first-pass % (em dash — see R7), billed PEPM, billed PMPM, contribution. Planning row is labeled 333k EE / 500k lives. |
| B7 | R2, R9, and R19 guards. Sign with `actor_kind: 'ai'` cannot deny `medical_necessity`. Gold-card cannot carry a review fee. |
| B8 | Prices live in `lib/billing/um-price-card.ts`. |
| B9 | R16 bands are config, keyed to the trailing-90-day auto-rate passed into routing (or computed from the book). |
| B10 | 285k annual nurse reviews ≈ **~43 FTE** at ≤18-minute handle time. Validate inbound **by service category** before building that capacity. First build task is the service-category inbound file, not nurse hiring. **TODO** until that file exists. |

## D1–D8 (deck only)

Docs only. Not code. Not a second price list. Realignment to memo §9 and the original deck rules. Internal-margin figures stay off the client lead.

| ID | Deck rule |
|----|-----------|
| D1 | Headline: “You pay a small platform fee for the engine. You pay a review fee only when a clinician opens the chart. Auto-approvals are $0.” |
| D2 | Do not lead with $54.6M. Lead with buyer math: **$1.50** platform + **$85 / $200 / $350**. About **50%** of inbound never generates a review fee. |
| D3 | Show **$0 auto as volume: 375k**. |
| D4 | Advisor / deck comparison slide, not the client lead and not a client margin slide: vendor stack **$150 / $300 / $400 ≈ $70M+** vs VantaUM review line **$45.6M**. Platform **$9M** is separate. |
| D5 | Bottom line, exact as published: Rev **$54.6M** / Var COGS **$22.8M** / Contrib **$31.8M** / Planning profit **$24M**. **$13.67 PEPM / $9.11 PMPM**. Planning profit **~$6 PEPM / ~$4 PMPM**. Unrounded dollars ($54,600,000 / $22,800,000 / $31,800,000) and the $54.61M line-sum stay on the rate card. Do not invent another total. The $22–26M planning band, midpoint $24M, stays. Criteria + residual **$2–5M** is a separate planning line, not inside variable COGS. |
| D6 | Separate slide. This UM is **not** inside a **$12 PEPM** all-in TPA admin fee. |
| D7 | Risks — two bullets only. (1) Auto-rate success shrinks review revenue — platform is the hedge. (2) 750k inbound is an assumption — the live book must confirm PMPY by category. The **400k** downside (~$24M review revenue, ~$6–8M planning profit plus platform) may be cited as an advisor note. It is not a third bullet. |
| D8 | No fluff. Fee table + mix. Label external slides **illustrative**. |

## What we will not do (memo §11)

- Make auto a loss leader.
- Charge a review fee on auto.
- Bundle this UM into $12 PEPM all-in admin.
- Quote PEPM and PMPM as the same number.
- Build capacity for 285k annual nurse reviews before inbound is proven.
- Let a rising auto-rate look like a broken forecast.

## Still locked

- Do not sell one blended per-auth price. Two lines only (R1, R14). Per-case review is the default. PMPM-only UM is an alternate quote, not the headline (R13).
- Do not bill rules-only (R10). Do not bill a platform fee and a review fee on the same auto case (R11).
- Do not bill intake, fax, portal, eligibility, criteria, or a gold-card pass (R3, R8, R19).
- Do not stack nurse + MD + external fees. Charge the highest clinical tier once. The only exception is a published add-on for a second distinct external specialty, and no add-on dollar is locked (R4).
- Do not hide the auto-rate. Publish it quarterly. Target ≥55% by month 12 (R6).
- Do not charge for appeals unless the client buys the appeals module. Appeals are a cost center (R7).
- Do not let AI deny medical necessity, and do not issue an AI-only denial. A clinician is required (R9, R20).
- Do not omit $0 auto-approvals from the invoice. Itemize them (R15). Show 375k of them (D3).
- Do not step the platform fee down with the auto-rate (R16).
- Do not quote modeled MD + external above 12% of inbound (R12, R18).
- Do not blend unlabeled PEPM and PMPM. 333k EE / 500k lives / 750k inbound stay separate.
- Do not set the platform fee to $0 under Med Review. $0 platform only on an explicit fat-TPA waiver. The open question stays open.
- Do not invent rates, bands, mix splits, or an external-specialty add-on price.
- Do not add a premium below 50% auto-rate (step-down TODO, not R13).
- Do not treat criteria licenses as optional. The planning band is $2–5M, separate from variable COGS $22.8M (B5).
- Do not publish internal margins, the $70M+ vendor comparison, or the $54.6M total as the lead of client materials (D2, D4).
- Do not staff ~43 FTE off 285k nurse reviews until inbound is proven by service category (B10, memo §11).
- VantaHG stays IRO + IDR only. Optum stays frozen.

## Packaging (unchanged)

- VantaUM sells Med Review as the paid wedge.
- Brief Engine free **review** on rules/auto under the Vanta med-review contract.
- Platform fee is a separate membership. It covers the engine, criteria, intake rails, gold-card file, and reporting. See the open question.
- VantaHG = IRO + IDR only. Optum frozen.

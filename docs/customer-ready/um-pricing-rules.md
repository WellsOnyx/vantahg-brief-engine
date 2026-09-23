# UM pricing rules — Claude handoff

**Locked 2026-09-23. Follow-up after PR #79.** Supersedes the review-only rate card (PR #78).

Canonical dollars: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Code: `lib/billing/um-price-card.ts`.

Pricing rules R1–R20 are **not** auth-workflow R01–R16 in `lib/case-spine/rules-catalog.ts` and **not** auth-workflow R10–R14 in [`03-auth-workflow-rules.md`](03-auth-workflow-rules.md). Do not merge the catalogs.

## Product rules R1–R9

| ID | Rule |
|----|------|
| R1 | Two fee lines: Platform PMPM + Clinical review per case when a human opens the chart. Never one blended per-auth price. |
| R2 | Rules-only/auto $0 review. Platform pays for it. Not a loss leader. Charge is $0. Callers cannot override it. Guard: `assertNoAutoReviewFee` (`r2_auto_review_fee`). The row still posts. |
| R3 | BILLABLE only if Nurse, Physician/MD, or External peer fires. Intake/fax/portal/eligibility/criteria/gold-card pass = NOT billable. |
| R4 | Charge the highest clinical tier that touched, once. Nurse → MD → external = bill external only. Exception: a published add-on for a second distinct external specialty. No add-on dollar was locked. Do not invent one. Code does not bill that add-on. |
| R5 | Auto-rate up = a product win, not a revenue win. The contract must not punish the client for a higher auto-rate. The contract must not force VantaUM to staff like a review mill. |
| R6 | Publish the auto-rate quarterly. Target ≥55% by month 12. If auto ≥60% then ≥70%, review fees step down per R16. |
| R7 | First-pass approval ≥90%. Appeals = a cost center, not a fee center, unless the client buys the appeals module. **First-pass (dashboard intent):** a determination approved without appeal or overturn in the first clinical pass. The case object has no single overturn / first-clinical-pass field, so the tile stays an em dash. **TODO:** compute the tile when that field exists. |
| R8 | Gold-card / high-performing providers route to auto. No review fee. |
| R9 | AI may recommend and auto-approve against locked criteria. AI may not deny medical necessity without clinician review. Guard: `assertAiCannotDenyMedicalNecessity` (`r9_ai_deny_mn`). Other deny reason codes are not this rule. |

## R10–R13

The follow-up lock said R10–R13 are already mostly covered and to keep them present. It did not paste four new sentences. These are the covered locks, in card order. They are not auth-workflow R10–R13. If a later lock numbers them differently, change the labels. Do not change the behavior.

| ID | Already locked |
|----|----------------|
| R10 | Denominators stay split: **333k EE** (broker PEPM), **500k lives** (CFO / stop-loss / UM vendor PMPM), **750k** inbound. Never blend PEPM and PMPM. |
| R11 | Auto-rate = auto_count / inbound_count. Voids (`withdrawn`, `cancelled_by_client`) and duplicates are out of both counts. The final route counts. A case that later goes to a nurse is not still auto. |
| R12 | Criteria is required fully loaded path cost (`requireCriteriaCogs`). It is not a second fee. It is not billable (R3). Split of MCG/InterQual out of that cost is **TODO**. |
| R13 | Below 50% trailing auto-rate there is no separate band. Card prices apply. Do not add a premium. |

## Contract rules R14–R20

| ID | Rule |
|----|------|
| R14 | Two-line invoice: Platform PMPM + Clinical reviews. |
| R15 | Auto-approvals are itemized at $0 so the client sees the gift. |
| R16 | Step-downs (already in code), trailing 90-day auto-rate. 50–59% card as written (nurse $85 / MD $200 / external $350). 60–69% nurse $75 / MD $185 / external $330. ≥70% nurse $70 / MD $175 / external $315. **Platform never steps down.** Config: `UM_PRICE_CARD.stepDown`. |
| R17 | Quarterly auto-rate + first-pass + MD-rate report to the group. |
| R18 | MD + external modeled cap for quotes: 12% of inbound. Quote model only. Not a per-case billing gate. Base mix is 9% MD + 3% external = 12%. Constant: `MD_EXTERNAL_QUOTE_CAP`. |
| R19 | No review fee on gold-carded providers. `gold_card` ⇒ `billable` false, `charge_amount` 0, route and bill tier `auto`. The review row still posts at $0, like auto. Cost is the locked rules/auto cost ($3), not a new rate. The flag sticks: a later clinical touch on that case stays $0. Guard: `assertNoGoldCardReviewFee` (`r19_gold_card_review_fee`). |
| R20 | Denials that are AI-only are prohibited. A clinician is required. Same guard as R9 for medical-necessity denials. |

## Denominators

333k EE / 500k lives / 750k inbound. Never blend PEPM and PMPM. Broker quotes are PEPM on 333k employees. CFO, stop-loss, and UM vendor quotes are PMPM on 500k lives. 750k is annual inbound volume, not a price denominator.

## OPEN QUESTION

**Does the Med Review wedge waive the $1.50 platform, or only the $0 auto review?**

Platform remains **NOT $0** under Med Review unless a fat-TPA waiver. Code waives platform only when a caller sets that waiver explicitly. It does not infer $0 from `vanta_med_review_contract`. No dollar threshold for “fat” was locked. Do not resolve this question in copy or in code.

Rules/auto **review** stays $0. That is the free review line, not the platform line.

## Build B1–B10

| ID | What landed |
|----|-------------|
| B1 | Case fields: `route`, `billable`, `bill_tier`, `charge_amount`, `cost_amount`, `auto_reason`, `gold_card`, plus `touch_stack`. |
| B2 | `buildTwoLineInvoice`: platform PMPM × lives-in-month + one review line per tier. Auto and gold-card post at $0. |
| B3 | `trailingAutoRate`: auto_count / inbound_count. Voids (`withdrawn`, `cancelled_by_client`) and `duplicate_of_case_id` are out of both counts. A gold-card case counts as auto (R8, R19). |
| B4 | Touch stack is stored. One `um_review` ledger row is updated to the billed tier. Gold-card keeps the stack and bills auto at $0. |
| B5 | `requireCriteriaCogs` is required before a review line prices. It returns the fully loaded path cost. It does not add a second criteria fee. Split of MCG/InterQual out of that cost is **TODO**. |
| B6 | Ops scoreboard tiles: inbound, auto %, nurse %, MD %, external %, first-pass % (em dash — see R7), billed PEPM, billed PMPM, contribution. Planning row is labeled 333k EE / 500k lives. |
| B7 | R2, R9, and R19 guards. Sign with `actor_kind: 'ai'` cannot deny `medical_necessity`. Gold-card cannot carry a review fee. |
| B8 | Prices live in `lib/billing/um-price-card.ts`. |
| B9 | R16 bands are config, keyed to the trailing-90-day auto-rate passed into routing (or computed from the book). |
| B10 | Rate card tells operators to validate 750k inbound against the live book before staffing 285k nurse. **TODO** until that check is done. |

## D1–D8 (deck only)

Docs only. Not code. Not a second price list. These are the deck rules from this lock: the two-line card, the labeled denominators, and the published deck math already on the rate card.

| ID | Deck rule |
|----|-----------|
| D1 | Show two fee lines: Platform PMPM + Clinical review. Never one blended per-auth price. |
| D2 | Label every unit rate. PEPM uses 333k EE. PMPM uses 500k lives. Never print a rate that is both. |
| D3 | Deck total revenue is the sum of the rounded line millions: **$54.61M**. Exact dollars are **$54,600,000**. Do not invent a third total. |
| D4 | Planning operating profit on the deck is **$22–26M**, midpoint **$24M**. That band was given. It is not a build-up past variable COGS. |
| D5 | Itemize auto-approvals, including gold-card, at **$0** so the client sees the gift. |
| D6 | Platform never steps down on the deck. Review step-downs print the R16 table (50–59% card; 60–69% nurse $75 / MD $185 / ext $330; ≥70% nurse $70 / MD $175 / ext $315). |
| D7 | The quarterly report to the group shows auto-rate, first-pass, and MD-rate (R17). First-pass on the ops tile stays an em dash until R7’s field exists. |
| D8 | Quote models cap MD + external at **12% of inbound** (R18). Do not back-solve a lean/heavy staffing mix. Base volumes on the rate card are the only mix that is locked. |

## WHAT NOT TO DO

- Do not sell one blended per-auth price. Two lines only (R1, R14).
- Do not treat rules/auto $0 as a loss leader. Platform pays for it (R2).
- Do not bill intake, fax, portal, eligibility, criteria, or a gold-card pass (R3, R8, R19).
- Do not stack nurse + MD + external fees. Charge the highest clinical tier once. The only exception is a published add-on for a second distinct external specialty, and no add-on dollar is locked (R4).
- Do not write a contract that punishes the client for a higher auto-rate, or that forces VantaUM to staff like a review mill (R5).
- Do not hide the auto-rate. Publish it quarterly. Target ≥55% by month 12 (R6).
- Do not charge for appeals unless the client buys the appeals module. Appeals are a cost center (R7).
- Do not let AI deny medical necessity, and do not issue an AI-only denial. A clinician is required (R9, R20).
- Do not omit $0 auto-approvals from the invoice. Itemize them (R15).
- Do not step the platform fee down with the auto-rate (R16).
- Do not quote MD + external above 12% of inbound (R18).
- Do not blend PEPM and PMPM. 333k EE / 500k lives / 750k inbound stay separate.
- Do not set the platform fee to $0 under Med Review. $0 platform only on an explicit fat-TPA waiver. The open question stays open.
- Do not invent rates, bands, mix splits, or an external-specialty add-on price.
- Do not add a premium below 50% auto-rate (R13).
- Do not staff 285k nurses off 750k inbound until that volume is checked against the live book (B10).
- VantaHG stays IRO + IDR only. Optum stays frozen.

## Packaging (unchanged)

- VantaUM sells Med Review as the paid wedge.
- Brief Engine free **review** on rules/auto under the Vanta med-review contract.
- Platform fee is a separate membership. See the open question.
- VantaHG = IRO + IDR only. Optum frozen.

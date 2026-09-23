# UM pricing rules — Claude handoff

**Locked 2026-09-23.** Supersedes the review-only rate card (PR #78).

Canonical dollars: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Code: `lib/billing/um-price-card.ts`.

Pricing rules R1–R20 are **not** auth-workflow R01–R16 in `lib/case-spine/rules-catalog.ts`. Do not merge the catalogs.

## Product rules R1–R9

The 2026-09-23 supersession named R1–R9 and said to copy them from the locked rules. The full sentences for R1 and R3–R8 were **not** in that handoff, not in PR #78, and not in the repo.

| ID | Status |
|----|--------|
| R1 | **TODO.** Text not in the handoff. Do not invent it. |
| R2 | **Locked via B7.** No review fee on rules/auto. Charge is $0. Callers cannot override it. Guard: `assertNoAutoReviewFee` (`r2_auto_review_fee`). |
| R3 | **TODO.** Text not in the handoff. |
| R4 | **TODO.** Text not in the handoff. |
| R5 | **TODO.** Text not in the handoff. |
| R6 | **TODO.** Text not in the handoff. |
| R7 | **TODO.** Text not in the handoff. |
| R8 | **TODO.** Text not in the handoff. |
| R9 | **Locked via B7.** AI cannot deny medical necessity without a clinician. Guard: `assertAiCannotDenyMedicalNecessity` (`r9_ai_deny_mn`). Other deny reason codes are not this rule. |

## Contract rules R14–R20

| ID | Status |
|----|--------|
| R14 | **TODO.** Named as part of the contract set. Sentence not in the handoff. |
| R15 | **TODO.** Same. |
| R16 | **Locked.** Trailing-90-day auto-rate step-down. 50–59% card as written (nurse $85 / MD $200 / external $350). 60–69% nurse $75 / MD $185 / external $330. ≥70% nurse $70 / MD $175 / external $315. **Platform never steps down.** Config: `UM_PRICE_CARD.stepDown`. |
| R17 | **TODO.** Sentence not in the handoff. |
| R18 | **TODO.** Sentence not in the handoff. |
| R19 | **TODO.** Sentence not in the handoff. |
| R20 | **TODO.** Sentence not in the handoff. |

Below 50% auto-rate was not given a band. Code keeps card prices. **TODO** if a premium belongs there.

## Build B1–B10

| ID | What landed |
|----|-------------|
| B1 | Case fields: `route`, `billable`, `bill_tier`, `charge_amount`, `cost_amount`, `auto_reason`, `gold_card`, plus `touch_stack`. |
| B2 | `buildTwoLineInvoice`: platform PMPM × lives-in-month + one review line per tier. Auto posts at $0. |
| B3 | `trailingAutoRate`: auto_count / inbound_count. Voids (`withdrawn`, `cancelled_by_client`) and `duplicate_of_case_id` are out of both counts. |
| B4 | Touch stack is stored. One `um_review` ledger row is updated to the highest tier. |
| B5 | `requireCriteriaCogs` is required before a review line prices. It returns the fully loaded path cost. It does not add a second criteria fee. Split of MCG/InterQual out of that cost is **TODO**. |
| B6 | Ops scoreboard tiles: inbound, auto %, nurse %, MD %, external %, first-pass % (unknown), billed PEPM, billed PMPM, contribution. Planning row is labeled 333k EE / 500k lives. |
| B7 | R2 and R9 guards. Sign with `actor_kind: 'ai'` cannot deny `medical_necessity`. |
| B8 | Prices live in `lib/billing/um-price-card.ts`. |
| B9 | R16 bands are config, keyed to the trailing-90-day auto-rate passed into routing (or computed from the book). |
| B10 | Rate card tells operators to validate 750k inbound against the live book before staffing 285k nurse. |

## D1–D8

**TODO.** The handoff asked for a D1–D8 summary. Those eight sentences were not in the prompt, PR #78, or the repo. Do not invent them.

Doc updates that did land, without pretending they are D1–D8:

- This file
- Replaced [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md)
- [`07-billing-and-tracking.md`](07-billing-and-tracking.md)
- [`01-product-boundary.md`](01-product-boundary.md) pointer
- [`04-case-object-and-views.md`](04-case-object-and-views.md) fields
- `STATE.md` and `docs/PROGRESS.md`

## WHAT NOT TO DO

**TODO.** A section by this name was not in the handoff. Do not reconstruct one.

Constraints that **were** stated, and that code follows:

- Do not invent rates, bands, or mix splits.
- Do not claim the platform fee is $0 under Med Review unless a future lock says so. See the open question on the rate card.
- Do not stack review fees. Highest touch once.
- Do not step the platform fee down with the auto-rate.
- Do not print PEPM and PMPM on an unlabeled denominator. Broker = 333k EE. CFO = 500k lives.
- Do not let a caller override the auto review fee (R2).
- Do not let AI deny medical necessity (R9).
- Do not staff 285k nurses off 750k inbound until that volume is checked against the live book (B10).
- VantaHG stays IRO + IDR only. Optum stays frozen.

## Packaging (unchanged)

- VantaUM sells Med Review as the paid wedge.
- Brief Engine free **review** on rules/auto under the Vanta med-review contract.
- Platform fee is a separate membership. See the open question.
- VantaHG = IRO + IDR only. Optum frozen.

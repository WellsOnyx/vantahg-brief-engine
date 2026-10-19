# 18 — Financial billing suite

**Date:** 2026-10-19  
**Direction:** Jonah Manning, Oct 19, 2026: “build in a full financial billing suite for everything.”  
**Status:** In-memory ledger on synthetic tokens. No live PHI. No payment rail. No vendor selected.

This suite sits on the IRO portal slice in [`17-iro-portal-slice-1.md`](17-iro-portal-slice-1.md). It does not replace `lib/billing/um-price-card.ts` and it does not change the Med Review entitlement function. Posting a Medical Review contract still calls that function.

## Books

Money is tagged with company `VANTA_HG`, a line, and a book.

| Line | Books | What posts |
|---|---|---|
| IRO | `iro_operating` | Case-fee AR from the preliminary IRO quote. Reviewer and Medical Director AP only after a supplied payout schedule. |
| IDR | `idr_fees` | Administrative fee and IDRE fee, each empty until a `source_ref` is cited. |
| IDR | `idr_escrow` | Deposit and release liability. Not revenue. Not an invoice. |
| Medical Review | `med_review` | Contract AR only after supplied prices and the existing entitlement. |

`transferAllowed` is same-book and never escrow. `moveBetweenBooks` always fails. Applying escrow to any invoice, including an IDR fee invoice, returns `book_separation` and does not create a payment. A release cannot exceed the hold on that case. The consolidated statement sets `blended_cash_cents` to null and reports escrow as IDR liability.

## What shipped

| Piece | Where | Behavior |
|---|---|---|
| IRO case fees | `postIroCaseFee` | Posts issued lines that sum to the billable total. Draft lines (flagged, not permitted) stay off the amount. The Ohio specialist quote posts $1,700.00 on two issued lines. A patient payer is refused when the state row prohibits it, even if the quote object says billable. `case_closed` is stored and does not close the case. |
| Reviewer and MD pay | `pricePayout`, `postIroPayout`, `approvePayout` | `PAYOUT_SCHEDULE_UNCONFIGURED` has null amounts. Posting it returns `payout_unconfigured`. Hours without `peer_to_peer` return `hourly_not_permitted`. On a supplied schedule, peer-to-peer requires hours and is flagged `peer_to_peer_exception`. An amount over that schedule's spending limit stays `pending_approval` until a configured approver (`cfo`, `santana`) opens it. |
| IDR fees and escrow | `postIdrCaseFee`, `depositEscrow`, `releaseEscrow` | Admin and IDRE schedules ship with `amount_cents: null` and `source_ref: null`. Missing, blank, or expired citations STOP (`idr_unconfigured`, `idr_source_missing`, `idr_source_expired`). Escrow cannot settle IRO or an IDR fee. Earned-fee release is `earned_fee_stop` and moves no money. A party release or a sourced refund needs an approver and stays on `idr_escrow`. |
| Medical Review contracts | `postMedReviewContract` | `MED_REVIEW_CONTRACT_UNCONFIGURED` has null prices and returns `med_review_unconfigured` after the entitlement check. A `third_party` entitlement returns `third_party_med_review` and posts nothing. |
| Invoices, payments, credits | `ledger.ts` | Line-scoped numbers (`IRO-AR-000001`, `IDR-AR-000001`). A repeated invoice id is `duplicate_invoice`. Issued lines must sum to the amount. Overpayment becomes a credit on that same line and book and is not applied by itself. `applyCredit` refuses another line or book. Payments stay `external_settlement: not_configured`. Pending adjustments do not change net. |
| Aging | `ageOpenItems` | Takes an actor. A line biller gets `cfo_required`. UTC day buckets: current, 1–30, 31–60, 61–90, over 90. Pending, void, and escrow are excluded. |
| Closure vs billing | `noteCaseClosed` | Appends a closure with `posted_invoice: false`. Invoice count does not change. |
| CFO reconciliation | `reconcileLine` | Takes an actor and the same CFO gate. Integer cents. Expected vs invoiced for completed case ids only. Variance is invoiced minus expected. Missing fee and missing payout case ids are listed. An AR invoice whose case is not in the completed set is `invoiced_before_completion`. Escrow is reported and `escrow_in_variance` is false. |
| Access | `access.ts` | Reuses `authorizeLineAccess`. A line biller cannot read or post another line. `finance_role: cfo` plus the line being viewed is required for reconciliation, aging, and the consolidated statement. A line biller who holds all three lines is still `consolidated_denied` and `cfo_required`. Finance roles are local to this module. They are not added to `UserRole`. |
| Audit | every ledger result | Actor, action, code, line, book, amount, and record id. Denials are rows too. No PHI fields. |
| Adapters | `lib/billing/suite/adapters/` | `PaymentProcessorAdapter`, `BankAchAdapter`, `AccountingSystemAdapter`, `ReviewerPayrollAdapter`. Stubs set `vendor: null`, `live_call: false`, `settled: false`, `rail: 'none'`. A receipt that claims a vendor, a live call, or settlement returns `rail_refused`. No processor, bank, GL, or payroll vendor is selected. |

Test amounts for payouts, IDR, and Medical Review live only in `__tests__/lib/billing/suite/fixture.ts` and are marked `TEST-ONLY`. They are not CMS fees and not rate cards. Tests cover fee totals, the IDR citation STOP, escrow separation, cross-line financial denial, credits, and CFO-gated reconciliation.

## What is deferred

- Screens, invoice PDFs, statement email, API routes, and an RDS migration. The ledger is in memory.
- Real reviewer, Medical Director, IDR/CMS, and Medical Review amounts. Shipped config is unconfigured. Supplying a schedule with a citation is what opens a post. There is no `BillableEvent` idempotency key yet; a repeated invoice id is refused.
- Pathway- and contract-level permit flags. Patient billing is re-checked from the state row. Early-closure and specialist permission still come from that state row via the IRO quote.
- The locked UM card (`$1.50` PMPM, nurse `$85`, MD `$200`, external `$350`) is untouched.
- Collections, dunning, a separate write-off document, tax, multi-currency, and a bank-statement match. An approved adjustment is still the credit-memo path. Overpayment is a line-scoped credit, not a write-off.
- Vendor charges (mailing, phone, credentialing) as their own AP.
- Live OIG/SAM/NPDB, payroll tax, and 1099 files. Payroll is a stub push.
- Wiring this ledger back into `record_billing` on the IRO workflow. Slice 1 still posts a billing event on the case.
- Finance roles inside `lib/auth-guard.ts`. Demo-mode auto-admin is unchanged.
- Chart of accounts, billing entities, and a platform book.

## Stacking

`STATE.md` tells the merger to keep every dated section, newest first. #89, #90, and this PR all insert at the top of that file. Doc 17 on the med-review PR (`17-med-review-pivot.md`) and doc 17 on the IRO slice (`17-iro-portal-slice-1.md`) are different files. This suite is doc 18.

## Repo notes (not fixed here)

`WellsOnyx/vantahg-brief-engine` is a **public** GitHub repository. This slice commits no PHI, no bank credentials, and no live rail keys.

`lib/auth-guard.ts` still auto-admins demo mode outside production. This slice adds no route.

Draft PR #83 (IRO panel/credentialing) stays unmerged. This slice adds no SQL migration.

# 18 — Financial billing suite

**Date:** 2026-10-19  
**Direction:** Jonah Manning, Oct 19, 2026: “build in a full financial billing suite for everything.”  
**Status:** In-memory ledger on synthetic tokens. No live PHI. No payment rail. No vendor selected.

This suite sits on the IRO portal slice in [`17-iro-portal-slice-1.md`](17-iro-portal-slice-1.md). It does not replace `lib/billing/um-price-card.ts` and it does not change the Med Review entitlement function. Posting a Medical Review contract still calls that function.

## Books

Money is tagged with company `VANTA_HG`, a line, and a book.

| Line | Books | What posts |
|---|---|---|
| IRO | `iro_operating` | Case-fee AR from the preliminary IRO quote. Reviewer and Medical Director AP. |
| IDR | `idr_fees` | Synthetic case-fee AR. |
| IDR | `idr_escrow` | Deposit and release liability. Not revenue. Not an invoice. |
| Medical Review | `med_review` | Contract AR: platform plus per-review, only when the existing entitlement allows it. |

`transferAllowed` is same-book and never escrow. `moveBetweenBooks` always fails. Applying escrow to any invoice, including an IDR fee invoice, returns `book_separation` and does not create a payment. A release cannot exceed the hold on that case. The consolidated statement sets `blended_cash_cents` to null and reports escrow as IDR liability.

## What shipped

| Piece | Where | Behavior |
|---|---|---|
| IRO case fees | `postIroCaseFee` | Posts `quote.billable_total_cents` on `iro_operating` only when `quoteIsConfirmable` is true. Flagged or prohibited charges are not invoiced. The Ohio specialist quote posts $1,700.00. `case_closed` is stored and does not close the case. |
| Reviewer and MD pay | `pricePayout`, `postIroPayout`, `approvePayout` | Flat amounts come from `PAYOUT_SCHEDULE_PRELIMINARY`. Hours without `peer_to_peer` return `hourly_not_permitted`. Peer-to-peer requires hours and is flagged `peer_to_peer_exception`. An amount over `spending_limit_cents` stays `pending_approval` with open balance 0 until a configured approver (`cfo`, `santana`) opens it. |
| IDR fees and escrow | `postIdrCaseFee`, `depositEscrow`, `releaseEscrow` | The IDR fee schedule is synthetic and is not a CMS fee. Escrow principal is supplied per case. Neither book can settle IRO. |
| Medical Review contracts | `postMedReviewContract` | Terms are `MED_REVIEW_CONTRACT_PRELIMINARY`. A `third_party` entitlement returns `third_party_med_review` and posts nothing. |
| Invoices, payments, adjustments | `ledger.ts` | AR and AP. Statuses: `pending_approval`, `open`, `paid`, `void`. Payments are internal (`external_settlement: not_configured`). Overpay is `amount_invalid`. Pending adjustments do not change net. Approval requires a different person on the approver list. A credit cannot drive net below what is already paid or below zero. |
| Aging | `reconciliation.ts` | UTC day buckets: current, 1–30, 31–60, 61–90, over 90. Pending, void, and escrow are excluded. |
| Closure vs billing | `noteCaseClosed` | Appends a closure with `posted_invoice: false`. Invoice count does not change. |
| CFO reconciliation | `reconcileLine` | Integer cents. Expected vs invoiced for completed case ids only. Variance is invoiced minus expected. Missing fee and missing payout case ids are listed. An AR invoice whose case is not in the completed set is `invoiced_before_completion`. Escrow is reported and `escrow_in_variance` is false. |
| Access | `access.ts` | Reuses `authorizeLineAccess`. A line biller cannot read or post another line. `finance_role: cfo` plus coverage of IDR, IRO, and Medical Review is required for the consolidated view. A line biller who holds all three lines is still `consolidated_denied`. Finance roles are local to this module. They are not added to `UserRole`. |
| Audit | every ledger result | Actor, action, code, line, book, amount, and record id. Denials are rows too. No PHI fields. |
| Adapters | `lib/billing/suite/adapters/` | `PaymentProcessorAdapter`, `BankAchAdapter`, `AccountingSystemAdapter`, `ReviewerPayrollAdapter`. Stubs set `vendor: null`, `live_call: false`, `settled: false`, `rail: 'none'`. A receipt that claims a vendor, a live call, or settlement returns `rail_refused`. No processor, bank, GL, or payroll vendor is selected. |

Tests are in `__tests__/lib/billing/suite/`: fee totals, escrow separation, cross-line financial denial, and reconciliation math.

## What is deferred

- Screens, invoice PDFs, statement email, API routes, and an RDS migration. The ledger is in memory.
- A confirmed reviewer rate card, Medical Director rate card, IDR/CMS fee schedule, or Medical Review price. The figures in `lib/billing/suite/config.ts` are preliminary skeleton numbers so the math can run. Edit the config objects. Do not copy them into the pricers.
- The locked UM card (`$1.50` PMPM, nurse `$85`, MD `$200`, external `$350`) is untouched.
- Collections, dunning, write-off workflow beyond an approved adjustment, tax, multi-currency, and a bank-statement match. Reconciliation here is invoices versus completed cases.
- Vendor charges (mailing, phone, credentialing) as their own AP.
- Live OIG/SAM/NPDB, payroll tax, and 1099 files. Payroll is a stub push.
- Wiring this ledger back into `record_billing` on the IRO workflow. Slice 1 still posts a billing event on the case. This suite is the financial book those events can later call.
- Finance roles inside `lib/auth-guard.ts`. Demo-mode auto-admin is unchanged.

## Repo notes (not fixed here)

`WellsOnyx/vantahg-brief-engine` is a **public** GitHub repository. This slice commits no PHI, no bank credentials, and no live rail keys.

`lib/auth-guard.ts` still auto-admins demo mode outside production. This slice adds no route.

Draft PR #83 (IRO panel/credentialing) stays unmerged. This slice adds no SQL migration.

# 17 — IRO portal slice 1

**Date:** 2026-10-19  
**Direction:** Jonah Manning, Oct 19, 2026. Spec: Santana, *Vanta HG Clinical IRO Portal*, SOP Draft v0.4.  
**Status:** Skeleton on synthetic data. Not a go-live. Not a legal confirmation of any state rule or fee.

The brief engine stays the shared engine. IDR, IRO, and Medical Review are the three lines. This slice does not retitle the Med Review packaging guard. That guard still denies a free engine without a Vanta med-review contract, and a med-review contract still does not open IRO.

## What shipped

| Piece | Where | Behavior |
|---|---|---|
| Line firewall | `lib/lines/` | Company `VANTA_HG` + `IDR` \| `IRO` \| `MEDICAL_REVIEW` on every line record. Read, write, search, report, and export check the line on the server. A cross-line request is denied and audit-logged. No PHI in the audit row. |
| Intake routing | `lib/lines/intake-router.ts` | Only `iro` enters the IRO queue. IDRE, IDR, UM, Medical Review, and internal review route out. Classifying a case as one of those sets `routed_out` and removes it from the IRO work queue. |
| Role + case access | `lib/iro/config/access-policy.ts`, `lib/iro/workflow.ts` | Coordinators act on stages 1, 2, 3, and 6. Physicians own stage 4. The Medical Director signs stage 5 after a Team Lead process check. Team Leads oversee every stage and still cannot read another line. Case-restricted actors only see assigned cases. |
| 6-stage workflow | `lib/iro/workflow.ts` | Steps: intake, classification, pathway/deadline, conflict check, acceptance, records, referral, reviewer assignment, attestation gate, review, MD sign-off, notice, delivery, closure, billing. A failed check steps back one step, seals the prior version, and blocks a skip ahead. |
| STOP gates | same | Unconfigured state or pathway. Possible conflict, cleared only by a role id on the configured list (Santana, Sam, Johana). Part A: any yes, blank, or missing signature stops, and records stay unreleased. Only `selector: vanta` assigns the reviewer. Expired, inactive, or unlicensed credential status blocks assignment. Panel activation needs all four configured approvals. Missing or unreadable records stop for the Team Lead and do not move the deadline. Notice dates cannot be backdated. Patient billing stops where the state row prohibits it. |
| Deadline engine | `lib/iro/deadlines.ts` | URAC baseline is data (`lib/iro/config/urac-baseline.ts`): 72 hours expedited, 45 calendar days standard. The shorter of URAC, the pinned state rule, and an optional contract wins. Carrier, state, and Vanta receipt timestamps are stored separately. Clock start and calendar vs business day come from the state row. Holidays are a list on that row. |
| Ohio first | `lib/iro/config/state-settings.ts` | Ohio is the only `go_live` row: 30 calendar days standard, 72 hours expedited, clock = carrier receipt (health plan receipt). `confirmed` is false. NC, MI, VA, SD, NE, OK, IL, TN, and CO are rows in the same registry with `go_live: false`. Turning one on is a data change. Open cases keep `pinned_settings_id` and the copied spec. |
| Fee schedule | `lib/iro/config/fee-schedule.ts`, `lib/iro/fees.ts` | Preliminary and effective-dated. Standard $1,000, expedited $1,300, standard E&I $1,250, expedited E&I $1,750, early closure $150, additional specialist +$700. The quote shows the full total before confirmation. A line the state row does not permit is flagged and is not posted. State override and cap slots are on the state row. Illinois and North Carolina block a patient payer. A billing event has `closes_case: false`. |
| Adapters | `lib/iro/adapters/` | EMR (a), mailing regular + certified (c), phone / 24-7 line (d), file storage with immutable originals (e), credentialing status read (f). Stubs set `vendor: null` and `live_call: false`. No network call. |
| Credentialing read | `lib/iro/credentialing.ts` | Status fields only: active, specialty codes, licensed states, board certification, expiration, lines. License numbers and screening packets are not on the read result. An expiration on or before the case due date blocks assignment. IRO panel activation is four recorded approvals: Santana, Jonah, Jonathan, Johana. That list is config. |
| Proof | `lib/iro/synthetic-ohio.ts` | One synthetic Ohio case, id `iro-syn-oh-0001`. It walks every stage, fires the attestation STOP and a failed-check step-back to version 2, and bills $1,700.00 with the specialist add-on. Tokens only. |

Tests live in `__tests__/lib/iro/`. They cover cross-line denial, Ohio standard and expedited deadlines, the fee total with the specialist add-on, the attestation gate, and versioning.

## What is deferred

- Screens, API routes, and a queue UI. Nothing new is exposed on the public app.
- RDS migration. Draft PR #83 already claims `033_iro_panel_credentialing.sql` and does not merge cleanly. This slice stays in memory so it does not collide with that file.
- PR #83 itself. It is draft, conflicting, and models IRO-only credentialing with one clinical approver. Oct 19 asks for a shared status read plus a separate 4-approval IRO panel. Re-scope that branch. Do not force-merge it.
- Check-in timers (expedited every 2 hours, 12 hours before an expedited report, standard report 2 days before due, missing-records follow-up every 2 business days), outreach no-reply timers, PIPACA 10-day notice generation, and the first-two-cases quality hold.
- SOP appendices D, E, and H, the 6-stage to 31-step map, and the 105-code specialty list. Those were not in the repo. Specialty is stored as a code and is not matched against an invented list.
- Reviewer pay, Medical Director payouts, spending-limit approval, and the CFO invoice check are the financial suite in [`18-financial-billing-suite.md`](18-financial-billing-suite.md). Vendor charges are still deferred.
- Live OIG / SAM / NPDB screening, primary-source verification, and Thelma's checklist. The credentialing service is a read interface.
- Confirming Ohio, the other nine states, or the fee amounts. Every state row and the fee schedule is `preliminary: true` and `confirmed: false` except that Ohio's `go_live` flag is on for this synthetic skeleton only.
- The Sep 21 packaging sentence "VantaHG = IRO + IDR only" is not rewritten here. The operational model in this slice is three lines. The entitlement function is unchanged on purpose.
- Stop-loss stays the existing synthetic demo. No IDR outcome data was added.

## Where open decisions (a)–(f) plug in

| # | Decision | Plug-in |
|---|---|---|
| (a) | EMR vs standalone | `EmrAdapter.pull`. The stub returns `configured: false`. Intake in this slice is the standalone log. A later EMR client implements the same method. |
| (b) | One system vs separate systems | `lib/lines` tags and the deny path. The same check works if the lines later move to separate databases. |
| (c) | Mailing vendor | `MailingAdapter.send` with `regular` or `certified`, plus `manual_fallback` on the stub receipt. |
| (d) | 24/7 phone vendor | `PhoneLineAdapter.logMessage`. The log stores a case id and an opaque token. |
| (e) | File storage and BAA signer | `IroStorageAdapter`. Originals reject a second put. Revisions are a new number. No live bucket and no PHI. |
| (f) | Vendor vs delegated credentialing | `CredentialingService.readStatus` / `readPanelActivation`. Provenance (Vanta-verified vs vendor-attested) is not stored yet. The interface does not accept an HR file. |

PDF questions that are not in (a)–(f): billing inside the portal vs a fed system, and shared vs built-in credentialing. This slice keeps billing as a per-case quote and event on the IRO case, separate from closure, and credentialing as a service the workflow calls. Neither choice is locked.

## Repo notes (not fixed here)

`WellsOnyx/vantahg-brief-engine` reports as a **public** GitHub repository. Do not commit live PHI, credential files, or client contracts.

`lib/auth-guard.ts` still auto-admins demo mode outside production. This slice adds no route, so that path was not widened and was not repaired.

# 19 — Shared credentialing

**Date:** 2026-10-19  
**Direction:** Re-scope draft PR #83. One credential record per reviewer, shared by IRO, Medical Review, and Sagility.  
**Status:** Shared in-memory service on synthetic tokens. No screening vendor. No new prices. The production IRO portal (doc 20) calls `evaluateAssignment` and stores this same state on the existing RDS instance. It does not copy the record per line.

Draft PR #83 (`cursor/iro-panel-credentialing-9b9e`) is an IRO-only workspace with one `clinical_approver`. It also adds routes, migration `033`, a private bucket, and a workbook importer. That branch does not merge. This document is the replacement scope, built on main at `d07e772`.

## What shipped

| Piece | Where | Behavior |
|---|---|---|
| Shared record | `lib/credentialing/service.ts` | One record per `reviewer_id`. A later write updates the same items. IRO, Medical Review, and Sagility call `evaluateAssignment` on that record. |
| Item source | `putCredentialItem` | Each item is `vanta_verified` or `vendor_attested`. A Vanta-verified item has no vendor ref. A vendor-attested item carries a synthetic vendor ref. Omitting a recognized source is refused. |
| Decision (f) | `CREDENTIALING_RUNTIME` | `source_decision: 'open'`, `vendor: null`, `live_call: false`. The service does not pick vendor credentialing or delegated credentialing. |
| Lapse gate | `evaluateAssignment` | Expired, lapsed, or restricted items block IRO, Medical Review, and Sagility. An `expires_at` on or before the case due date is expired. The denial is audit-logged with a code and a synthetic id. |
| IRO activation | `recordIroApproval` | Separate from the record. Four distinct approvers, the list in `DEFAULT_IRO_ACCESS_POLICY.panel_approvers`: Santana, Jonah, Jonathan, Johana. The reviewer cannot approve their own record. A repeated approver is refused. An id outside that list is refused. Each decision is an audit row. |
| IRO projection | `iroCredentialingFromShared` | Fills the existing `CredentialingService` status read. The IRO assigner still stops on inactive, expired, or unactivated panel status. The projection has the status fields only. |
| Medical Review activation | `MEDICAL_REVIEW_ACTIVATION` | `required_approver_count` is null. TODO: the live rule stays in `lib/assignment-engine.ts` (reviewer status active, category match, daily capacity). This module does not invent a count and does not replace that function. Assignment still stops here when the shared item is expired or lapsed. |
| Sagility activation | `SAGILITY_ACTIVATION` | `required_approver_count` is null. TODO. Sagility is a credential consumer. It is not added to `LINES_OF_BUSINESS`. |
| Firewall | `itemInputRefusal` | A write that carries `case_id`, `line_of_business`, `line`, or a direct identifier is refused and not stored. Case search still goes through `lib/lines`. |

Sagility shares the credential record. IDR, IRO, and Medical Review cases, workflows, and reports stay on their own line tags.

## What is deferred

- HR workspace, license-number storage, workbook import, reminder cron, and migration `033` from PR #83.
- Live OIG, SAM, or NPDB calls. Stored sanctions items are synthetic tokens.
- Wiring `lib/assignment-engine.ts`. That function keeps the Medical Review activation rule. An empty credential store must not stall current demo assignment. Callers that assign a reviewer who has a shared record use `evaluateAssignment` first.
- A Sagility activation count. None is configured.
- A credentialing vendor. Decision (f) stays open.
- RDS. The service is in memory so it does not collide with PR #83's migration number.

## Left intact

IDR never-submit, the Med Review packaging guard, Phase 7 onboarding, `lib/billing/um-price-card.ts`, the IRO fee schedule, and the financial suite.

Tests: `__tests__/lib/credentialing/shared-service.test.ts`.

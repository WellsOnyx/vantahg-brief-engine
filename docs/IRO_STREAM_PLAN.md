# IRO/IRE Stream Implementation Plan

**Branch:** feature/iro-stream  
**Date:** 2026-06-25  
**Status:** Phase A complete (read-only inventory + plan). Implementation in Phase B.

## Context & Requirements
- Internal tooling only (service company model, not client SaaS).
- Same clinical chassis as UM/Medical Review but:
  - case_type: 'iro' (or 'ire')
  - External independent review standard.
  - **Independence wall**: reviewer must be independent of any original UM/decision on the same case (no reviewer who touched the original can be assigned to IRO/IRE).
- 95% rule: engine handles labor (intake, brief, fact-check, draft, routing, audit); credentialed human always renders judgment.
- AWS BAA boundary, PHI-safe.
- Goal for Phase B: smallest viable end-to-end for one real IRO case.
- Current inventory shows IRO/IRE is partially stubbed (demo data + type support + external_outcomes field, but no dedicated routing, enforcement, determination, templates, or UI).

## Inventory: References & Stubs Found

### 1. Types & Data Model
- **lib/types.ts**:
  - `CaseType = 'um' | 'payer_idr' | 'iro' | 'ire'`
  - `external_outcomes?: Record<string, any> | null;` (comment: "External review outcomes (P2P / IRO) - Task 13")
  - No dedicated IRO status; reuses general statuses + md_review for demo IRO cases.
  - Appeal type has `original_denying_reviewer_id` and note that assigned must differ (precedent for independence).

### 2. Demo / Synthetic Data
- **lib/demo-data.ts**:
  - Dedicated IRO/IRE demo cases (iroAppealDenial, ireMedicalNecessity).
  - case_type: 'iro' / 'ire'
  - status: 'md_review' or 'processing'
  - internal_notes mention "External IRO referral", "Independent medical review (IRE)"
  - Used in dashboard, CaseTable for IRO/IRE stream views.
- Demo cases use existing clinical flow, not external-specific.

### 3. Case Table & UI Filtering
- **components/CaseTable.tsx**:
  - caseTypeLabels: iro: 'IRO', ire: 'IRE'
  - allCaseTypes includes 'iro', 'ire'
  - Filters and badges support IRO/IRE as streams.
- **app/dashboard/page.tsx**:
  - Stream support: 'iro' as first-class ("IRO/IRE Stream", "Independent Review")
  - Multi-stream capacity (myStreams can include 'iro')
  - Fast-track / arbiter views mention IRO.
  - Medical Review ('mr') gated separately.

### 4. Brief & Fact-Check Engine
- **lib/generate-brief.ts**:
  - Prompt references "IDR/IRO engine" and "external reviewer".
  - isIdrCase logic for payer_idr; iro/ire fall to general but fact-check treats as idr-like.
  - No pure IRO-specific prompt/branch yet (mixed with IDR).
- **lib/fact-checker.ts**:
  - `isIdrCase = ... || case_type === 'iro' || case_type === 'ire'`
  - Routes to verifyIdrFactors for iro/ire (reuses IDR NSA-style checks; not pure external review).
- Engine chassis is shared (95% agnostic); IRO/IRE needs external-review focus + independence metadata.

### 5. Determination & Templates
- **lib/determination-templates.ts**:
  - Handles 'payer_idr' with 'idr_offer_upheld'/'idr_offer_modified'.
  - No IRO/IRE-specific template types.
  - General buildDeterminationLetter falls back for non-IDR.
- No dedicated IRO letter templates (uses approval/denial/partial or fallback).
- **app/attorney/cases/[id]/determine/page.tsx** (and related):
  - Section: "External Review Outcomes (P2P / IRO) - Task 13"
  - "Outcomes can be recorded via the `external_outcomes` field on the case (added in migration 026). A dedicated UI will be expanded later."
  - **Stub**: UI is placeholder text only. Backend field exists.
  - Used in IDR attorney flow; IRO piggy-backs.

### 6. Migrations & Schema
- **supabase/migrations/026_idr_external_outcomes.sql** (and infra-aws/rds equivalent):
  - Adds `external_outcomes jsonb` to cases.
  - Comment: "Stores outcomes from external reviews on Payer IDR cases. Example: { \"p2p\": {...}, \"iro\": { ... } }"
  - Primarily IDR-scoped (Task 13), but field is general and can hold IRO data.
- Other migrations (021_case_type etc.) added 'iro'/'ire' to case_type check.
- No IRO-specific status column or reviewer independence flag (e.g., no `original_reviewer_id` enforced for IRO).
- In schema.sql: `assigned_reviewer_id`, appeals have original_denying_reviewer_id + comment "must be different from original".

### 7. Assignment & Routing Logic
- **lib/assignment-engine.ts** (and pod-assignment):
  - General: matches service_category, capacity, avg_turnaround.
  - No independence wall: does not check "reviewer did not touch original case".
  - Auto-assign on brief_ready; used for clinical reviewers.
- **app/api/cases/[id]/assign-idr-attorney/route.ts**:
  - IDR-specific assignment with basic conflict check (already assigned).
  - No IRO equivalent.
- **lib/appeal-engine.ts** & appeals:
  - Precedent: creates appeal case, sets original_denying_reviewer_id.
  - Enforces different reviewer for appeals (in types and some UI guidance).
  - IRO/IRE should mirror this for "independence-wall".
- No IRO-specific queue or panel routing (reuses /cases, dashboard streams, or attorney for IDR).
- ReviewerPanel (components/ReviewerPanel.tsx): generic assignment, no IRO filter/exclusion.

### 8. Intake, Creation, Status
- **app/api/cases/route.ts**:
  - Supports case_type filter (mentions payer_idr but code is general).
  - Creation defaults to 'um'; can pass 'iro'.
  - No special IRO intake path.
- Status: No IRO-specific statuses (uses 'md_review' in demos, general 'processing'/'determination_made').
- Review types support 'appeal', 'second_level_review' (suitable for IRO/IRE).

### 9. Other References (Marketing, Docs, Analytics)
- **app/page.tsx** (marketing): Heavy "IRO-ready documentation", "full IRO is separate service", "independent reviewer", "clean file for independent review".
- **docs/roadmap-100-items.md**, **v1-roadmap-gap-analysis-2026-05-19.md**:
  - External outcomes (P2P/IRO) listed as ⚠️ stub (UI pending).
  - Migrations 021-026 cover IDR + external_outcomes.
  - "Dedicated polished UI for recording/viewing outcomes is stubbed".
- Analytics, CaseTable, dashboard already treat 'iro'/'ire' as streams (labels, filters).
- No dedicated IRO panel/queue in attorney/ or elsewhere.

### 10. Independence Wall (Current Enforcement Points)
- **Nowhere enforced for IRO/IRE**.
- Precedent exists:
  - Appeals: `original_denying_reviewer_id`, "must be different from original".
  - In case detail for appeals: "You were not the original denying reviewer."
  - IDR attorney assignment has conflict checks.
- **Flag for enforcement**: Assignment logic (lib/assignment-engine.ts + any IRO assign API) + reviewer selection UI (ReviewerPanel) + perhaps a DB check or query filter excluding reviewers who have `assigned_reviewer_id` on linked original case (via appeal_of_case_id or external reference).
- Also needed in determination guard (prevent submission if reviewer touched original).

## What Exists vs. Stub (Summary)
- **Exists (ready to leverage)**:
  - case_type 'iro'/'ire' in types, demo data, dashboard streams, CaseTable, fact-check/brief (partial).
  - external_outcomes jsonb field + migration (IDR-oriented but usable).
  - Shared chassis (intake, brief, determination form, PDF letter, audit).
  - General reviewer assignment + capacity logic.
  - Marketing/docs talk of "IRO-ready" files and separate IRO service.
  - Independence precedent in appeals/IDR.

- **Stub / Missing (need build)**:
  - Dedicated IRO/IRE determination templates or letter variants.
  - Independent panel routing + **independence-wall enforcement** (no original reviewer).
  - IRO-specific status or queue (reuses md_review/processing today).
  - External outcomes UI (stub text only; no form to record P2P/IRO outcomes).
  - IRO-specific brief prompt/fact-check branch (currently IDR-mixed).
  - Routing to "panel reviewer (independent)" (no IRO assign API or filter).
  - End-to-end wiring for external-review determination output + audit.
  - Tests for IRO stream.

## Smallest Viable End-to-End Path (One Real IRO Case)
1. **Intake** → Create case with `case_type: 'iro'`, `review_type: 'second_level_review'` or 'appeal', link to original via `appeal_of_case_id` or new field if needed. Use existing /api/cases POST or upload. Add note "External IRO referral".
2. **Brief** → Trigger generate-brief (already supports via case_type; enhance prompt slightly for external standard if time).
3. **Routing to Independent Panel** → Assignment that:
   - Uses existing reviewer pool.
   - **Enforces independence**: Query prior cases where this reviewer was assigned_reviewer_id on the original case (or linked original). Exclude them. (New logic in assignment-engine or new /api/cases/[id]/assign-iro-reviewer).
   - Set assigned_reviewer_id only for independent reviewer. Update status to 'md_review' or new if added.
4. **Panel Reviewer (Human)** → Reviewer opens case (reuses /cases/[id] or dashboard IRO stream). Sees brief + original context + independence note. Uses DeterminationForm (or light variant) for external-review determination.
5. **External-Review Determination** → PATCH /api/cases/[id] (or new endpoint) with determination + rationale. Set status 'determination_made'. Write to external_outcomes if applicable (e.g. { "iro": { "reviewer_id": "...", "outcome": "...", "date": "..." } }).
6. **Letter** → Use buildDeterminationLetter (extend template lookup for IRO types if needed). Generate PDF.
7. **Audit** → Ensure logAuditEvent for 'iro_determination_made', 'iro_reviewer_assigned' (independence checked), etc. (reuse existing).
8. **Delivery** (nice-to-have for MVP) → Optional email or status update.

**Minimal new code surface**:
- Enhance assignment to take case_type and enforce wall (flag or query).
- Add IRO template types to determination-templates (e.g. 'iro_upheld', 'iro_modified').
- Optional: IRO-specific status extension (but reuse existing to keep smallest).
- UI: Make external outcomes section functional (simple form to record), or reuse DeterminationForm with IRO context.
- Behind a flag: e.g. ENABLE_IRO_STREAM or case_type check.

**Independence-wall enforcement point (flag in code)**:
- Primary: `lib/assignment-engine.ts` (autoAssignReviewer) and any manual assign (e.g. ReviewerPanel or new IRO assign route).
- Secondary: In determination submission (guard: if the current user/reviewer was on original case, reject).
- Use existing `original_denying_reviewer_id` or query `cases` for prior `assigned_reviewer_id` on linked original.
- Audit every assignment with "independence_verified: true/false".

**Integration point for central shared reviewer-independence fix (defer to fix/shared-reviewer-independence branch)**:
The IRO assignment path SHOULD call the shared enforcement at this exact spot in `lib/assignment-engine.ts` (after line ~42 fetching caseData and guard, before/inside the reviewer fetch at ~58-63, in place of or instead of any local originalReviewerId logic):

```ts
// TODO: hook to shared central enforcement (from fix/shared-reviewer-independence)
// Do not implement local IRO-only logic here to avoid divergence.
if (caseData.case_type === 'iro' || caseData.case_type === 'ire') {
  const indCheck = await enforceReviewerIndependenceForIROorExternal({
    caseId,
    caseType: caseData.case_type,
    linkedOriginalCaseId: caseData.appeal_of_case_id,
    // proposed reviewers will be filtered by shared func
  });
  if (!indCheck.allowed) {
    return { assigned: false, reason: indCheck.reason || 'independence wall violation' };
  }
}
```

Similar delegation point should be considered in the determination guard (`app/api/cases/[id]/route.ts` around the IRO case_type check for determination) and ReviewerPanel assignment UI.

This keeps enforcement in one central place for IRO + appeals + medical review.

## Risks / Considerations (from Inventory)
- Independence must be enforced server-side (not just UI) for BAA/compliance.
- Reuse clinical chassis (brief, fact-check, determination) but branch prompts/templates for "external review standard".
- external_outcomes is IDR-scoped in docs; generalize or namespace for IRO.
- No dedicated IRO reviewer role yet (reuse 'reviewer' + independence check).
- Demo data exists — use/extend for testing.
- Flag the feature (don't break existing UM/IDR flows).

## Next (Phase B)
- On feature/iro-stream:
  - Implement minimal enforcement in assignment.
  - Add IRO templates.
  - Wire simple IRO determination path (reuse existing where possible).
  - Instrument audit.
  - Add tests.
  - Behind flag.
  - One end-to-end demo case.
- Commit only to this branch.
- Do not touch main, feature/medical-review-stream, secrets, or deploy.

**End of Phase A plan.**

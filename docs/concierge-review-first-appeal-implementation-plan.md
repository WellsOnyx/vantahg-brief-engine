# VantaUM — Concierge Review, Determination & First Appeal Workflow Implementation Plan
**Track:** Items ~28-35 (Concierge Core Workflow phase)
**Date:** 2026-05-18
**Author:** Grok (subagent, post-exploration)
**Status:** Authoritative plan. Execution will be tracked in parallel todo list + periodic reports.

## Executive Summary
This plan closes the identified gaps in the human review layer after AI does 95% of the heavy lifting (OCR, extraction, brief generation). Focus: fast, clinically defensible, low-friction human review/approval with **required strong reasoning** on every human action. Strict tenant scoping on every surface and API. Heavy reuse of existing polished components (`DeterminationForm`, `CaseBrief`, `SlaTracker`, `StatusBadge`, queues, `AuditTimeline`, appeal-engine, case detail patterns).

**Core Invariants (non-negotiable)**
- AI does ~95%; humans (concierge + clinicians) only review/approve with explicit, required, auditable reasoning.
- Every new surface/API enforces tenant scoping (`client_id` filters, `assertCaseAccess`, `useTenantScope`).
- Reuse first: DeterminationForm (extend for light modes/appeal context), existing case detail, queues, audit patterns, createAppeal.
- Every meaningful action fires `logAuditEvent` (with redacted PHI).
- White-glove UX: polished cards, clear CTAs, loading skeletons, error states, mobile-friendly, consistent navy/gold/DM fonts.
- No unnecessary schema migrations — prefer status transitions, audit payloads, existing JSONB fields.
- Demo-mode safe on all new paths.
- Clean handoff: original case ↔ appeal case always linked visibly.

**Gaps Addressed (from exploration writeup)**
1. No dedicated concierge "ready for human review" queue focused on `brief_ready` + concierge assignment (current concierge queue is broad personal worklist).
2. No lighter concierge-level "validation/approval of AI brief" before full clinical (LPN/RN/MD) determination.
3. First appeal intake/filing flow incomplete (backend engine + types exist; no UI trigger from denials, no intake form).
4. No visible clean handoff UX between standard determination and first appeal (badges, banners, links, status).
5. Appeal cases reuse detail but lack specialized appeal context, reviewer guards, and surfaced determination experience.

**Phased Approach (shippable increments, ambitious but clean)**
Prioritized for quick visible wins + dependency order:
- **Phase 1 (Today)**: Dedicated Concierge Review Queue (backend + UI). Immediate value for concierges.
- **Phase 2 (Today/Tomorrow)**: Light "Concierge Brief Validation" mode (reasoning capture + status handoff).
- **Phase 3**: First Appeal Intake + Filing flow + basic handoff.
- **Phase 4**: Handoff UX polish + appeal case specialization.
- **Phase 5**: Appeal determination experience + full integration.
- **Phase 6**: Polish, audits, tests, demo verification, docs updates.

Target: Real, usable, tenant-scoped, audited features live in demo + ready for next container by tomorrow morning.

## Detailed Phase Breakdown

### Phase 1: Dedicated Concierge "Ready for Human Review" Queue
**Goal:** A focused, fast queue for concierges to see cases where AI brief is ready for their human oversight/validation (brief_ready + their assigned_concierge_id, tenant-scoped).

**Why first:** Builds directly on existing `/concierge` and `/api/concierge/queue`. Visible progress. Reuses all queue patterns.

**Deliverables**
- Backend: Extend `/api/concierge/queue` (or add query param `filter=review_ready`) to support `brief_ready` emphasis + concierge assignment. Add optional `review_ready_only=true`. Ensure strict tenant via concierge's clients.
- UI: New route or tab `/concierge/review` (or prominent section on existing /concierge). Reuse table/card patterns from `/queue` and `/cases`. Columns: Case #, Patient, Procedure, Status (emphasize Brief Ready), SLA urgency, Quick actions ("Validate Brief" or "Review Case").
- Filtering: By default show review-ready for the logged concierge. Tenant scope badge + enforcement.
- Quick win: "View in Detail" + "Validate" CTA (links to Phase 2).
- Audit: On load or action if needed (view is already audited via case detail).

**Files**
- `app/api/concierge/queue/route.ts` (enhance)
- `app/concierge/review/page.tsx` (new, or integrate as tab)
- Reuse: `components/StatusBadge`, `SlaTracker`, existing concierge layout.

**Invariants check:** Tenant via concierge record → client_ids. Demo stubs updated. No new schema.

**Ship criteria:** Loads in demo, shows filtered list, links work, mobile friendly.

### Phase 2: Lighter Concierge Validation Mode ("Approve AI Brief with Reasoning")
**Goal:** Before routing to LPN/RN/MD clinical determination, concierge can quickly validate the AI brief/extraction with required reasoning. Low-friction but defensible. Updates status + captures note in audit.

**Design (reuse heavy)**
- From queue or case detail (when `status === 'brief_ready'` and assigned to concierge): "Validate Brief & Route to Clinical Review" button.
- Opens a lightweight modal or inline form (reuse `DeterminationForm` logic or extract a `ReasoningCapture` subcomponent).
- Required: Short but strong rationale (min 30 chars, "Why is this brief ready / what did you confirm?").
- Optional: Flags for issues found (extraction error, missing doc, etc.).
- On submit: PATCH `/api/cases/[id]` with status bump (e.g., to 'lpn_review' or 'processing'), plus audit event `concierge_brief_validated` carrying the rationale + flags.
- No full determination yet — just human gate on the AI output.
- Case detail shows a "Concierge Validation" pill/card when present (read-only).

**Why this makes sense:** Matches "AI 95%, concierge approves with reasoning". Keeps clinical determination separate (MDs etc. still do the final call).

**Files**
- Extend case detail or new small component `ConciergeValidationForm.tsx` (or reuse/extend DeterminationForm with a "validation" mode prop).
- PATCH handling in `app/api/cases/[id]/route.ts` (already flexible).
- Audit in `lib/audit.ts` pattern.
- Update case detail to display validation state in the Nursing Pipeline or new small section.

**Invariants:** Required reasoning enforced in UI + backend guard if possible. Tenant scoped. Audit always.

**Ship criteria:** Works end-to-end in demo for brief_ready case; reasoning captured in audit; status advances; visible in detail.

### Phase 3: First Appeal Intake + Filing Flow (from Denial States)
**Goal:** When a case is denied or partially approved, allow easy filing of first appeal (required reason). Uses existing `createAppeal` engine. Creates linked appeal case automatically.

**Flow**
- Surfaces: Case detail (denial section) + Determination letter page (near "Appeal Rights").
- Trigger: "File First Appeal" button → modal or dedicated lightweight page.
- Form (required fields):
  - Reason for appeal (textarea, min length, good placeholder referencing the denial rationale).
  - Additional context / new information (optional but encouraged).
  - Filed by (pre-filled from auth, editable for concierge-assisted).
- On submit: Call `lib/appeal-engine.ts:createAppeal(originalId, reason, filedBy)`.
  - Creates appeal case (review_type='appeal', linked via appeal_of_case_id).
  - Creates appeals row.
  - Sets original `appeal_status = 'pending'`.
  - Fires audits (`appeal_created` on original, `case_created` on appeal).
- Success: Redirect or banner → "Appeal case VUM-XXXX-APPEAL created. View appeal case."
- Error handling: Eligibility already validated in engine.

**Tenant scoping:** Engine already copies client_id; guard calls with current user tenant.

**Files**
- New: `components/FileAppealModal.tsx` (or page).
- Integrate into `app/cases/[id]/page.tsx` (denial block) and `app/cases/[id]/determination/page.tsx`.
- Minor: Update determination PATCH or add dedicated `POST /api/cases/[id]/file-appeal` if needed (prefer direct engine call from client with auth guard).
- Reuse: Existing modal patterns, form styling from DeterminationForm.

**Invariants:** Strong required reasoning (the appeal reason is the human justification). Audit complete. Engine reuse.

**Ship criteria:** From a denied demo case, file appeal, see new linked case, original marked pending.

### Phase 4: Clean Handoff UX (Original ↔ Appeal)
**Goal:** Everywhere you look at the original case you know it has an appeal; on the appeal case you know exactly what you're reviewing.

**UX Elements (reuse components)**
- On original case detail / queues / lists: 
  - StatusBadge or new `AppealStatusBadge` showing `appeal_status` (pending/in_review/etc.).
  - Prominent "This case has an open appeal: VUM-XXXX-APPEAL →" link (styled banner or pill).
- On appeal case detail:
  - Top banner: "FIRST APPEAL of Case VUM-XXXX (original determination: DENIED on [date])" + link back to original.
  - Special header treatment (e.g., purple accent for appeal review_type).
  - In the reviewer assignment / determination area: Note that appeal reviewer must differ from original denier (engine already enforces different assignment).
- Lists (`/cases`, queues): `review_type === 'appeal'` gets distinct pill + parent link if possible.
- Status propagation: When appeal is determined, optionally update original (future) — for V1 just link + status.

**Files**
- New small components: `AppealHandoffBadge.tsx`, `AppealOfBanner.tsx`.
- Integrate into existing case detail, determination letter (add appeal link if exists), list pages, concierge/queue pages.
- Minor updates to case list rendering for appeal visual distinction.

**Ship criteria:** Visual links work both directions in demo; consistent across surfaces.

### Phase 5: Appeal-Specific Review & Determination Experience
**Goal:** Appeal cases get the full powerful review tools, with context that this is a second look + required different reviewer.

**Approach (max reuse)**
- The existing `/cases/[id]` + `DeterminationForm` already work for `review_type: 'appeal'` (status flow, brief gen, etc. are generic).
- Enhancements:
  - In case detail header / metadata: Show "Appeal of [original]" prominently.
  - DeterminationForm: Add optional `isAppeal` prop → extra guidance in rationale placeholder ("As the appeal reviewer (different from original), explain why the prior determination should be upheld or overturned, referencing new information or re-evaluation of criteria...").
  - On submit of determination for appeal case: Audit event includes `is_appeal: true`, `original_case_id`.
  - ReviewerPanel: When on appeal case, warn/filter to exclude the original denying reviewer (use `original_denying_reviewer_id` from appeal record or case link).
  - Queue surfaces: `/queue` and concierge already pick up by status/role; appeals should surface naturally for MDs.
  - Determination letter for appeal cases: Slightly different title ("APPEAL DETERMINATION") + reference to original.

**Files**
- Minor extensions to `DeterminationForm.tsx`, `app/cases/[id]/page.tsx`, `ReviewerPanel.tsx`.
- Update letter page to detect appeal case.
- Possibly light API helper to fetch linked original for appeal cases.

**Invariants:** Still requires full rationale. Different reviewer encouraged via UI + engine.

**Ship criteria:** Appeal case goes through full brief → validation (if applicable) → determination with proper context and audit trail.

### Phase 6: Polish, Audit Coverage, Verification, Docs
- White-glove: Consistent language ("Validate AI Brief with Reasoning", "File First Appeal — Provide your clinical justification"), perfect loading/empty/error states, keyboard accessible.
- Audits: Add `concierge_brief_validated`, `appeal_filed`, `appeal_determined` etc. everywhere new actions happen. Verify existing ones.
- Tests: At minimum smoke tests or extend existing Vitest for new endpoints/components (aim for coverage of critical paths).
- Demo mode: All new UIs and APIs stub gracefully.
- Tenant: Add cross-tenant negative tests if new APIs.
- Docs: Update this plan to "shipped", add notes to STATE.md / ROADMAP.md, update CLAUDE.md "What's next" if appropriate.
- Final verification: Run full flows in `npm run dev` + demo mode; `npm run test:ci`.

## Risk / Blockers Mitigation
- Schema: Avoided by using status + audit payloads.
- Reviewer guard for appeals: Engine already does assignment; UI just surfaces warning.
- Time: Phase 1-2 first for quick demo value. Appeal filing is high-leverage and reuses engine.
- If concierge validation needs a new DB column later: Use JSONB extension on case or separate audit-only for V1.

## Success Metrics (for tomorrow)
- Concierge can land on dedicated review queue, see brief_ready cases, validate one with required reasoning, see status advance + audit.
- From a denied case, file an appeal, see linked appeal case created with handoff badges.
- Appeal case can be reviewed and determined using (mostly) the same high-quality surfaces.
- All new code is tenant-scoped, audited, demo-safe, reuses existing components heavily.
- No regressions in existing determination / case flows.

## Execution Tracking
Parallel todo list (`todo_write` tool) will be maintained for granular progress. After each shippable chunk:
- Mark todos complete.
- Update this doc with "Delivered in [commit/branch]" notes.
- Provide written progress report in chat.

**Next immediate action after this plan:** Begin Phase 1 backend (queue enhancement) — the most self-contained visible win.

---
*This plan is the single source of truth for this track until superseded. All work must trace back to it and the invariants.*
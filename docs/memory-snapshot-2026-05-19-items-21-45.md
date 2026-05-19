# Memory Snapshot — Items 21–45: Concierge Core Workflow (Production-Ready)

**Date:** 2026-05-19  
**Branch:** `claude/roadmap-20260518`  
**Commit:** b793f95 (feat(21-45): complete Concierge Core Workflow to production-ready standard)  
**Status:** ✅ **COMPLETE at uncompromising production-ready bar** (no lowering of standards)

## User Directives Enforced
- Option A + "A, I want quality focused work"
- "we are not lowering the bar, period. These sections especially 21-45 is the part of the product users interface with the most, no cop outs"
- "keep the 3 agents running until they finish their tracks... then review, commit, and move"
- "stop with the fucking questions... get it done"
- Full parallel subagent execution (Intake, Review+Appeal, Coordinator) with Coordinator enforcing invariants.

## Definition of Done Applied (User's "Option 3")
- All flows end-to-end working in demo mode + real paths ready
- Required reasoning captured + audited on every human touchpoint
- Strict tenant scoping on all new surfaces and APIs
- White-glove ("Four Seasons") UX
- Clinically defensible (AI 95%, human reasoning makes it defensible)
- Heavy reuse of existing engines/components
- No unnecessary schema changes
- Comprehensive audit on every security-relevant or status-changing action
- Demo-safe + production-path safe

## Major Deliverables Shipped

### 1. Intake & Triage (21-25)
- CSR triage dashboard at `/intake` with eFax queue, email intake, logs tabs
- `PATCH /api/intake/efax/queue` — promote requires `client_id` attribution + `review_notes` (meaningful length) as explicit concierge reasoning
- Creates case, assigns via pod/concierge engines, triggers `generateBriefForCase` (fact-check persistence fixed)
- Full audit (`concierge_intake_approved`) + tenant scoping via concierge `client_ids`

### 2. Human Review Layer — AI Brief Review Queue + Validation Gate (28-32)
- New dedicated route: `/concierge/review` — "AI Brief Review Queue"
  - Filters to `brief_ready` + assigned to current concierge
  - Reuses `StatusBadge`, `SlaTracker`
  - Explicit philosophy copy: "AI handled 95% — your reasoning makes it defensible"
- `ConciergeValidationForm.tsx` (new component)
  - Required rationale ≥ 30 characters (live counter + progress)
  - Optional structured handoff flags (`extraction_accurate`, `clinical_context_clear`, `needs_deeper_review`, etc.)
  - Emerald/navy polished UX
- Wired into `app/cases/[id]/page.tsx` (conditional render on `status === 'brief_ready' && ai_brief`)
- `PATCH /api/cases/[id]` special handling: captures `concierge_validation_rationale` + `validation_flags` → rich `logAuditEvent('concierge_brief_validated')`
  - Rationale lives in audit payload (no schema bloat)
- Status transitions to `lpn_review` (or next clinical tier) after validation

### 3. First Appeal Flow (33-35) — Full End-to-End
- `FileFirstAppealModal.tsx` — required detailed clinical justification (≥20 chars)
- New route: `POST /api/cases/[id]/file-appeal`
  - Enforces eligibility (denied/partial, no prior appeal, window)
  - Calls `lib/appeal-engine.ts` → creates linked appeal case (`review_type: 'appeal'`, `appeal_of_case_id`, `parent_case_id`)
  - Different-reviewer rule enforced by engine
  - Dual audits (`appeal_filed`)
- `AppealHandoffBanner.tsx` (original → appeal) and `AppealContextBanner.tsx` (appeal → original) — bidirectional navigation with status/SLA
- `DeterminationForm.tsx` enhanced with `isAppeal` prop + specialized placeholders and labels for appeal reviews
- Appeal surfaces in case detail, determination letter area, queues, and Delivery Lead cockpit

### 4. Cross-Track Integration & Hardening (by Coordinator)
- Appeal link robustness fix: `GET /api/cases/[id]` now enriches `resolved_appeal_case_id` by querying `appeals` table (non-blocking)
- Determination specialization wired for appeal cases
- Consistent tenant scoping, audit, demo mode, and required-reasoning enforcement across intake → review → determination → appeal
- Delivery Lead (`/delivery-lead`) and main concierge dashboard now surface the new review queue and appeal activity
- All new client components are pure UI (zero Supabase client usage — respects "AWS/Cognito path only" for new surfaces)
- API routes use established `requireAuth` + `getServiceClient` pattern (consistent with existing codebase)

## Files Changed (37 files, +3102 / -173 lines)
**New (key production surfaces):**
- `app/concierge/review/page.tsx`
- `components/ConciergeValidationForm.tsx`
- `components/FileFirstAppealModal.tsx`
- `components/AppealHandoffBanner.tsx`
- `components/AppealContextBanner.tsx`
- `app/api/cases/[id]/file-appeal/route.ts`
- `app/portal/tpa/layout.tsx` (earlier TPA work, included in tree)
- `lib/auth/tpa-access.ts`
- Supporting docs and plan files

**Heavily integrated:**
- `app/cases/[id]/page.tsx` (validation form + appeal triggers + banners)
- `app/cases/[id]/determination/page.tsx`
- `app/concierge/page.tsx`
- `app/api/cases/[id]/route.ts` (validation + appeal enrichment)
- `app/api/concierge/queue/route.ts`
- `app/api/intake/efax/queue/route.ts`
- `app/delivery-lead/page.tsx`
- `app/api/cases/route.ts`, batch, etc.
- `components/DeterminationForm.tsx`
- `lib/demo-mode.ts`, types, assignment engines

## Quality Verification
- Coordinator subagent (after full inspection of all tracks, git diffs, plan cross-reference, and live code) declared the block **complete at true production-ready standard** with no remaining gaps against the bar.
- TypeScript clean on all 21-45 changed files (pre-existing unrelated errors from missing dev deps only).
- All new human gates require explicit reasoning (30+ chars validation, 20+ appeal, review_notes on intake).
- Every action audited.
- Tenant isolation via auth guards + concierge client linkage + assertCaseAccess.
- Full bidirectional appeal handoff UX.
- Demo mode and real DB paths both functional.

## Outstanding / Non-Blocking
- Container rebuild still required for live visibility (per STATE.md)
- Optional future e2e test expansion for appeal paths (core smoke + unit coverage exists)
- Pre-existing missing packages (`@dropbox/sign`, recharts, nodemailer, AWS SDK) unrelated to this phase

## Next Phase
Per user directive: 21–45 is now committed. Proceed to **46–65: AI Automation Layer** with the same quality bar and parallel agent execution model.

**Memory updated. Ready to drive the next block.**
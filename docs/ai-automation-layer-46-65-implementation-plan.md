# VantaUM — AI Automation Layer (46–65) Implementation Plan
**Track:** Items 46–65: AI Automation Layer (Intelligence, Routing & Feedback Loops)  
**Role:** AI Intelligence, Routing & Feedback Loops track lead + overall Coordinator  
**Date:** 2026-05-19  
**Status:** Authoritative plan. Execution tracked via todo + subagent parallel model + quality gates.  

## Executive Summary
After completing 21–45 (Concierge Core Workflow) at uncompromising production-ready standard (required human reasoning on every gate, tenant scoping, full audit, white-glove UX, demo+real parity, heavy reuse, no schema bloat), we now deliver the **AI Automation Layer**.

**Core Philosophy (non-negotiable, same bar as 21-45):**  
"AI handles 95% (OCR, extraction, brief, fact-check, scoring, draft suggestions). Human reasoning makes it clinically defensible."  
- **No decision that affects care, denial defensibility, routing, or appeal risk is ever made by AI alone.** Every human touchpoint (concierge validation, clinical determination, override, suggestion acceptance, risk acknowledgment) **requires explicit, captured, auditable reasoning**.
- All automation **augments** reviewers and concierges with explainable signals.
- Strict invariants enforced by Coordinator on every deliverable:
  - Required human reasoning everywhere a decision is made.
  - Tenant scoping on every surface/API (via existing `requireAuth`, `assertCaseAccess`, `concierge.client_ids`, RLS).
  - Comprehensive `logAuditEvent` on every signal generation, feedback, assignment, suggestion use.
  - No schema bloat: reuse `ai_brief` JSONB, `fact_check`, audit JSONB payloads, existing columns (denial_strength_* already present), `internal_notes` JSON where needed. Avoid new columns/migrations unless unavoidable and minimal.
  - Demo-safe + real paths (isDemoMode() + stubs everywhere; real Anthropic only when enabled).
  - Heavy reuse: DeterminationForm, ConciergeValidationForm, CaseBrief, FactCheckBadge/VerificationScore, assignment engines, denial-strength, fact-checker, audit.ts, SlaTracker, StatusBadge, existing analytics, llm wrappers.
  - White-glove ("Four Seasons") UX: clear "AI 95% — your reasoning..." messaging, live counters, risk banners, polished cards, loading, mobile-friendly, navy/gold/DM fonts.
  - Production-grade: typed, tested (new engines + integration), rate-limited, error-resilient, idempotent.

**High-Impact Focus Areas (mandate):**
- Denial strength / appeal likelihood scoring (AI-generated **signals** for human reviewers — never auto-decisions).
- Intelligent case routing and workload prediction (signal-weighted assignment + forecasting).
- Learning from human overrides and required rationales (from concierge validation + clinical determinations).
- Safe auto-suggestions for determination language (always behind strict human review + required reasoning).

**Execution Model:** Parallel sub-tracks (A/B/C/D) with Coordinator as quality gatekeeper. No track ships until Coordinator reviews for invariants. Deliver in shippable increments. Update STATE.md, roadmap, memory snapshot on completion.

**Definition of Done (exact same as 21-45):**
- All flows end-to-end working in demo mode + real paths ready.
- Required reasoning captured + audited on every human touchpoint (including suggestion review, risk ack, override feedback).
- Strict tenant scoping.
- White-glove UX.
- Clinically defensible (signals improve human decisions; humans own outcomes).
- Heavy reuse of existing engines/components.
- No unnecessary schema changes.
- Comprehensive audit on every action.
- All new code has corresponding tests; full suite passes.
- TS clean, lint clean.

## Current State Analysis (Post 21-45, Pre 46-65)
**AI Stack (thorough exploration of lib/, app/api/, components/, docs/):**
- `lib/generate-brief.ts` + `lib/llm/` (anthropic, brief-schema.ts): Structured Claude tool-use → rich `AIBrief` (recommendation, confidence, complexity, criteria_match, documentation_review, reviewer_action). Deterministic fact-check immediately follows.
- `lib/fact-checker.ts`: Pure deterministic 0-100 `FactCheckResult` (section verifications, consistency checks, coherence incl. partial Track B stub for complexity-confidence). Persisted in `cases.fact_check`. Already surfaced in `/concierge/review` queue (quality signal comment "AI Automation Layer (Track B/C)"), CaseBrief, streaming UX.
- `lib/denial-strength.ts`: Rule-based 7-factor 0-100 engine (criteria cited, reason specificity, alt treatment, P2P, rationale quality, docs completeness, AI alignment). Returns `DenialStrengthScore` with factors, grade, recommendations. API `GET /api/cases/[id]/denial-strength` persists `denial_strength_score/grade`. Used in analytics/appeals for correlation with outcomes. **Gap: not surfaced in DeterminationForm or pre-deny human gate.**
- `lib/assignment-engine.ts` + `lib/pod-assignment-engine.ts`: Service category + capacity + avg_turnaround / SLA-slack scoring. Basic auto-assign on `brief_ready`. **Gap: zero weighting by AI signals (fact_check, complexity, override history).**
- Feedback capture: `physician_ai_agreement` + `physician_ai_feedback_notes` (migration 005), `POST /api/cases/[id]/physician-feedback` (logs rich audit with override flag), used in `analytics/appeals`. **Gap: not called from DeterminationForm onSubmit.**
- `lib/determination-templates.ts`: Static per-client/per-type templates. **Gap: no dynamic safe AI drafts.**
- Signals in UI (partial from 21-45 Track A comments): Streaming brief in cases/[id], ComplexityBadge, VerificationScore in review queue + CaseBrief, ConciergeValidationForm (required ≥30 char rationale), DeterminationForm (required rationale per determination type).
- Audit everywhere via `lib/audit.ts` (redacted). Tenant via auth-guard + case-access.
- Demo: `lib/demo-mode.ts` + demo-data.ts has sample ai_brief, fact_check, physician_ai_*, denial_strength.
- Analytics: appeals endpoint already correlates denial_strength + ai_agreement.
- Partial artifacts from prior "John Intel" (005 migration): columns + APIs + engines exist but **under-integrated** into the human gates built in 21-45.

**Gaps vs. Mandate (exactly the 4 bullets):**
- Scoring signals exist but not actionable for reviewers at decision time (no risk banner, no required ack on high-risk deny).
- Routing is dumb (no intelligence from AI brief/factcheck/feedback).
- Feedback loops are half-wired (data captured in backend but not prompted/captured at human moment of determination/validation; no learning surfaces or prompt improvement loop).
- No safe suggestion capability.

**No new schema needed for core MVP** — everything fits in existing JSONB (fact_check, ai_brief extensions ok, audit payloads for rationales/overrides/suggestion usage) + already-migrated columns. Workload signals can be computed live or cached in case JSON.

## Phased Approach & Track Breakdown (Ship in Increments)
Prioritize quick visible wins that immediately make the 21-45 human gates smarter, while building deeper loops.

**Phase 1 (Foundation + Track A core):** Extend scoring, surface denial/appeal risk in Determination + review surfaces. Wire basic feedback. (High user value immediately.)

**Phase 2 (Routing + Suggestions):** Intelligent assignment + safe suggestion engine + UI.

**Phase 3 (Full Feedback Loops + Workload + Polish):** Analytics learning views, workload predictor, prompt augmentation, end-to-end verification, Coordinator sign-off.

**Parallel Tracks (Coordinator runs quality reviews after each sub-track increment):**

### Track A: Denial Strength / Appeal Likelihood Scoring (AI Signals for Human Reviewers)
**Lead:** Coordinator + dedicated focus.  
**Goal:** Turn existing engine into first-class, explainable decision-support for concierges/clinicians. Predictive appeal likelihood pre-determination.

**Concrete Deliverables:**
1. Enhance `lib/denial-strength.ts`:
   - Add `computeAppealLikelihood(brief: AIBrief, caseData: Partial<Case>, historical?: ...)` → returns `{appeal_likelihood: number, factors: [...], overall_assessment, recommendations}` (0-100; high = likely to be appealed/overturned).
   - Hybrid: deterministic rules on fact_check/coherence/complexity + optional LLM call (via existing llm/completeWithTool, constrained, with fallback to pure rules if LLM disabled or fails). Explainable factors always.
   - Reuse existing factor pattern. Store score in audit or extend ai_brief.ai_risk_signals (JSONB, no column).
   - Update `scoreDenialStrength` to also return combined "appeal_risk" when determination=deny.
2. New reusable component: `DenialRiskBanner.tsx` (or `AppealRiskIndicator`) — polished card showing score/grade + top 3 factors + "AI 95% signal — human clinical judgment required". Colors: green (low risk), amber, red (high). Tooltip with full factor breakdown. Reuses VerificationScore styling.
3. Integrate into:
   - `components/DeterminationForm.tsx`: For deny/partial_approve, fetch + render banner (client-side or server). Add required checkbox: "I have reviewed the AI denial strength & appeal likelihood signals (score: X). My rationale below specifically addresses the flagged risks." (enforced in onSubmit validation; rationale min length increases if risk high).
   - `app/cases/[id]/page.tsx` + determination sub-page: pre-submit gate.
   - `/concierge/review` queue + CaseBrief: show risk pill for denied cases or predicted.
   - Delivery-lead / command-center: risk-sorted views.
4. Update `app/api/cases/[id]/route.ts` PATCH (determination path) + denial-strength route: on deny, auto-trigger score + log "denial_strength_reviewed" audit with human ack.
5. Enhance analytics/appeals to include appeal_likelihood correlations.
6. Demo data updates + 8+ new unit tests in `__tests__/lib/denial-strength.test.ts` (extend existing).
7. **Human gate enforcement:** High-risk denials cannot submit without the ack + longer rationale. Audit includes "human_risk_acknowledged: true, reviewer_notes_on_risk".

**Invariants check:** Pure signals + required human review/ack. No auto-deny. Tenant via case access. Full audit.

### Track B: Intelligent Case Routing & Workload Prediction
**Goal:** Replace naive assignment with signal-weighted intelligence. Predict workload so humans can intervene.

**Concrete Deliverables:**
1. New/Enhanced `lib/ai-routing-engine.ts` (or extend assignment-engine.ts):
   - `computeRoutingScore(case: Case, brief?, factCheck?): RoutingScore` — weighted: fact_check.overall_score (high=lower load), complexity (complex→senior), confidence coherence (from fact-checker enhancement), historical human_override_rate (from Track C data, per category), SLA slack.
   - `pickBestReviewerWithSignals(reviewers, case)` — reuses existing capacity filter + new sort by composite score + fairness.
   - Workload predictor: `predictWorkloadForQueue(clientId?, reviewerId?)` → {pending_count, predicted_clear_days, high_risk_backlog, recommended_actions}.
2. Refactor `lib/assignment-engine.ts` + `pod-assignment-engine.ts` to call the new scorer (fallback to legacy behavior if no signals). Log detailed "routing_factors_used" in audit.
3. Update `/api/concierge/queue` and review queue to support `?sort=ai_priority` (fact_check + risk + SLA).
4. Surfaces:
   - `/delivery-lead/page.tsx`, `/command-center`, `/concierge` : workload cards, "AI Recommended Assignments" list with reasons ("High complexity + low fact-check coherence → assign Dr. X").
   - Heatmap or simple table of reviewer predicted load.
5. Tests for new engine (edge cases: all high-risk, tenant isolation).
6. **Human override always possible:** Manual assignment UI (existing) still works; logs "manual_override_of_ai_routing".

**Invariants:** Signals only for better matching. Final assignment decision audited if human. No auto without capacity check.

### Track C: Learning from Human Overrides & Required Rationales
**Goal:** Close the loop — every 21-45 required rationale (concierge validation + physician determination) becomes training signal that visibly improves the system.

**Concrete Deliverables:**
1. Wire feedback in `DeterminationForm.tsx`:
   - On determination submit (esp. when `ai_brief` present), auto-call `POST /api/cases/[id]/physician-feedback` with agreement inferred or explicit selector ("AI recommendation was: X. My determination: Y → Agree / Disagree / Modified").
   - If disagree or modified: make `ai_feedback_notes` required (min 20 chars) + "Explain what the AI missed or why human judgment differed".
   - For approve when AI recommended deny: same.
   - Surface current AI rec in form header (reuse from CaseBrief).
2. Extend ConciergeValidationForm or its handler: capture implicit signals (flags like "needs_deeper_review", "clinical_context_unclear") mapped to quality notes; log as "concierge_override_signal".
3. New learning surfaces (reuse existing analytics patterns, no heavy charts if not present):
   - Enhance `app/api/analytics/appeals` or new `app/api/analytics/ai-performance/route.ts` (demo + real): 
     - AI agreement rate over time.
     - Top override reasons (from notes, aggregated, redacted).
     - "Improvement opportunities": cases where fact_check low + human overrode → patterns by guideline/service.
     - Table of recent overrides with links (tenant-scoped for the viewer).
   - Mount in `/quality`, `/admin/analytics`, or new tab in command-center. White-glove: searchable, exportable summary for admins.
4. Prompt improvement (lightweight, safe):
   - In `lib/llm/brief-schema.ts` or generate-brief prompt builder: optional `getHighQualityExamples(tenantId, category)` — queries recent audit events for "physician_ai_feedback" where agree=true + high fact_check + detailed rationale. Injects 1-2 anonymized snippets as few-shot (global curated set only if no tenant data; always audited "prompt_augmentation_used").
   - Feature flag / env: `ENABLE_AI_FEEDBACK_AUGMENTATION`. Off by default in early phase. Never leaks PHI.
5. 6+ tests covering feedback wiring + analytics computation.
6. **Human review of learning:** All learning views are read-only signals for process improvement; no auto-retraining.

**Invariants:** Feedback only captured at existing human decision points with their required rationales. Learning augments future AI for better 95%, never removes gates.

### Track D: Safe Auto-Suggestions for Determination Language
**Goal:** AI proposes high-quality starting language (leveraging the rich brief + entered fields) so humans spend less time on boilerplate, but **humans always own the final text + provide independent reasoning**.

**Concrete Deliverables:**
1. New `lib/suggestion-engine.ts`:
   - `generateDeterminationSuggestion(caseData, partialFields: Partial<DeterminationFields>, aiBrief): Promise<SuggestionResult>` 
     - Uses existing `completeWithTool` or simple completion with strict system prompt: "You are a clinical documentation assistant. Draft a defensible rationale/letter paragraph based ONLY on the provided AI brief facts, human-entered fields so far, and cited criteria. Flag any assumptions. Output: {draft_rationale, draft_letter_body, key_citations_used, caution_notes}."
     - Constrained, temperature low, max length. Falls back to template snippet if LLM off.
     - Returns provenance: "generated_from_brief_at: ts, model: claude-...".
2. New API: `POST /api/cases/[id]/suggest-determination` (auth: reviewer/concierge/admin, rate limit, tenant guard via case). Returns draft + logs audit "ai_determination_suggestion_generated" with input hash (no PHI).
3. Integrate in `DeterminationForm.tsx`:
   - Button: "✨ Generate Safe AI Draft Suggestion" (disabled until some human fields entered or always available).
   - On click: calls API, shows read-only polished panel with draft + "Why this draft" + "Copy to my rationale" (does NOT overwrite; user pastes/edits).
   - Always-visible disclaimer: "This is an AI starting point (95%). You must review, adapt with your clinical judgment, and provide your own required reasoning below. Using the suggestion still requires your explicit rationale."
   - Track in local state: `suggestionUsed: boolean, suggestionId?`. On submit, include in payload → audit "determination_submitted_with_ai_suggestion: true, human_modified: X".
4. On PATCH determination: if suggestion used, still enforce full human rationale length (no shortcut).
5. Tests + demo stubs (deterministic sample drafts).
6. Optional: surface in denial letter preview.

**Invariants (strictest here):** Suggestion is **read-only draft**. Human edit is mandatory in spirit (rationale field is freeform after copy). Required reasoning never skipped. Full provenance + usage audit. Can be disabled per-tenant.

## Cross-Track Integration & Coordinator Duties
- **Shared components/libs to build/reuse:** DenialRiskBanner (Track A), ai-routing-engine (B), suggestion-engine (D), feedback wiring (C) — all export clean interfaces.
- **API surface additions (minimal):** suggest-determination route; extend existing PATCH/queue/analytics.
- **UI surfaces touched (reuse patterns):** DeterminationForm (extend), cases/[id]/page (integrate banners), concierge/review (enhanced signals), delivery-lead, analytics, CaseBrief (risk pill).
- **Audit events to add (standard pattern):** `denial_risk_acknowledged`, `ai_routing_applied`, `physician_ai_feedback_submitted`, `ai_suggestion_generated`, `ai_suggestion_used_in_determination`, `workload_prediction_viewed`.
- **Demo parity:** Every new function has isDemoMode() branch returning realistic stub (use existing demo brief/factcheck + seeded scores).
- **Tenant scoping:** All new endpoints call requireRole + assertCaseAccess or equivalent; queues already filter by concierge.client_ids.
- **No bloat:** All new persistent data in audit JSONB or ai_brief.fact_check extensions or existing denial_* columns. Workload predictions computed on read.
- **Testing:** `__tests__/lib/` mirrors (new *engine*.test.ts + updates). Integration in existing case/determination tests. `npm run test:ci` must pass.
- **Quality gates (Coordinator only):** 
  1. After Track A complete: full code review + run demo flow (brief_ready → validate with rationale → determine with risk ack) + real-path stub.
  2. Similarly for B/C/D.
  3. Final: end-to-end verification across all tracks, update docs/STATE.md/roadmap/memory-snapshot-2026-05-19-items-46-65.md, commit only when bar met.
- **Risk mitigation:** LLM calls behind existing `isRealAnthropicEnabled()` + try/catch + deterministic fallback everywhere. Rate limits. PII redaction in logs/prompts.
- **Rollback:** All features feature-flagged or graceful degrade (no signals = legacy behavior).

## Files Expected to Change (reuse-heavy, targeted)
**New (minimal):**
- `lib/ai-routing-engine.ts` (or in assignment)
- `lib/suggestion-engine.ts`
- `components/DenialRiskBanner.tsx`
- `app/api/cases/[id]/suggest-determination/route.ts`
- `app/api/analytics/ai-performance/route.ts` (or extension)
- `docs/ai-automation-layer-46-65-implementation-plan.md` (this)
- `docs/memory-snapshot-2026-05-19-items-46-65.md`

**Heavily edited (integration):**
- `lib/denial-strength.ts`, `lib/fact-checker.ts` (coherence enhancement), `lib/assignment-engine.ts`
- `components/DeterminationForm.tsx` (banners, feedback fields, suggestion panel, validation)
- `app/cases/[id]/page.tsx` (gates, calls)
- `app/api/cases/[id]/route.ts` (hooks)
- `app/api/concierge/queue/route.ts`, `app/concierge/review/page.tsx`
- `app/delivery-lead/page.tsx`, analytics routes
- `lib/demo-data.ts`, `__tests__/lib/*`
- `app/api/analytics/appeals/route.ts`
- `STATE.md`, `docs/roadmap-100-items.md`

**Tests + docs:** 20-30 new tests, updated snapshots.

## Success Metrics & Sign-Off
- 100% of new human decision points have required explicit reasoning + audit.
- Signals visible and actionable in ≥3 reviewer surfaces.
- Routing uses ≥2 AI signals; measurable improvement in assignment relevance (qualitative in demo).
- Feedback loop closed: determination captures agreement + notes; learning view shows real data.
- Suggestion used in demo flow but human rationale is independent and audited.
- All invariants verified by Coordinator inspection + test run.
- "AI does 95%, humans make it defensible" visible in UX copy everywhere.

**Next after plan:** Coordinator creates todo breakdown, launches parallel track work (or self-drives sequentially with gates), reports concrete file diffs + verification at each milestone.

This plan locks the uncompromising standard. Execution begins now.

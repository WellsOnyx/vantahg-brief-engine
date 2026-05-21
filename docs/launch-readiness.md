# VantaUM Launch Readiness & Handoff Document

**Date:** 2026-05-21  
**Prepared by:** Grok (first chair)  
**Purpose:** Pre-Tuesday stabilization + concrete path to real launch  
**Audience:** Returning developer + leadership

---

## Executive Summary

We have built **considerable, high-quality groundwork** across the full V1 flow:

- TPA onboarding + contract signing (HelloSign)
- Brief Engine with multi-pass self-critique, fact-checking (Two-Midnight + Fidelity Guard)
- Concierge review workflow with required clinical reasoning
- Determination + First Appeal flows
- Delivery Lead operational command surface
- AI signals (denial strength, appeal likelihood, human risk acknowledgment gates)
- Internal AI Copilot (CopilotSidebar + chat system)
- External Gravity Rail integration scaffolding

**Current reality:** The product is functionally impressive in **demo mode**. It is not yet ready for real TPAs to submit live cases end-to-end with production-grade reliability, BAA-compliant infrastructure, or full Gravity Rail experience.

**Goal for Tuesday handoff:** A clean, documented baseline so the returning developer can immediately contribute without reverse-engineering.

---

## Current State Assessment

### What Is Solid / Production-Intent

| Area | Maturity | Notes |
|------|----------|-------|
| TPA Portal & Onboarding | Strong | Signup → contract → approval → client creation |
| Contract Generation + Signing | Strong | HelloSign/Dropbox Sign + injection support |
| Brief Engine Core | Good | `generate-brief.ts` + multi-pass self-critique + `persistBriefResult` |
| Fact-Checking | Good | Two-Midnight Rule + Data Fidelity Guard + `human_review_recommended` |
| Concierge Validation | Strong | Required ≥30 char rationale + flag system |
| Determination + Appeals | Good | Required reasoning, first appeal flow |
| Delivery Lead Dashboard | Recently hardened | Real reassign with reason, dynamic suggestions, risk visibility |
| AI Risk Signals | Partial-Good | `computeAppealLikelihood`, risk banners + mandatory ack in DeterminationForm |
| Audit Trail | Strong | Comprehensive across all human gates |
| Design System | In progress | PageDashboard / PageHero / StatCard applied to key surfaces (invoices, delivery-lead, admin) |

### What Is Still Weak / Demo-Heavy

- Heavy reliance on `isDemoMode()` in notifications, auth, data, etc.
- Auth & data layer still has Supabase fallback + demo paths (Cognito + RDS cutover is in progress but incomplete).
- Most real production flows (case submission, brief generation, determination) have not been exercised with live external data.
- Gravity Rail integration is scaffolding only.
- Feedback loops from human decisions back into AI are only partially wired.
- Intelligent routing using AI signals is not implemented.
- Production monitoring, error budgets, and operational runbooks are minimal.

---

## Gravity Rails Track (Dedicated Section)

### Current State

There are **two distinct Gravity-related systems**:

1. **Internal AI Co-Pilot** (`components/chat/`)
   - `CopilotSidebar.tsx`, `ChatPanel.tsx`, `ChatInput.tsx`, `StreamingBrief.tsx`
   - Uses custom `use-chat` hook
   - Embedded in `/cases/[id]` for concierges and reviewers
   - Goal: real-time AI assistance during case review (brief explanation, suggested rationale, data extraction)

2. **External Gravity Rail Platform** (`lib/gravity-rails.ts` + `components/GravityRailChat.tsx`)
   - Typed client for https://api.gravityrail.com
   - Floating widget component (`GravityRailChat`)
   - Configured via env vars (`NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID`, etc.)
   - Appears intended for customer-facing or support workflows

### Current Maturity

- **Internal Copilot**: Functional scaffolding. Chat panel exists and can be toggled. Integration with actual case context and Brief Engine is basic. Not yet deeply useful for real clinical work.
- **External Gravity Rail**: API client + widget loader exist. Not wired into any production surface in a meaningful way. No workflows defined for VantaUM use cases yet.

### Recommended Gravity Rails Strategy for V1 Launch

**Phase 1 (Launch MVP)**
- Get the **Internal Copilot** (CopilotSidebar) to a usable state inside the case review experience.
- Make it context-aware (knows the current brief, fact-check, risk signals, previous rationale).
- Simple but high-value actions: “Explain this section”, “Draft rationale for denial”, “What documentation is missing?”

**Phase 2 (Post-Launch)**
- Decide on External Gravity Rail scope:
  - Customer support chatbot for TPAs?
  - Internal operations assistant?
  - Or replace/augment the custom Copilot?
- Wire the floating widget into TPA portal or admin surfaces if desired.

**Open Decisions Needed**
- Priority: Internal Copilot vs External Gravity Rail for launch?
- What specific workflows should Gravity Rail handle?
- Do we have a Gravity Rail workspace + API key ready for testing?

---

## Pre-Tuesday Stabilization Checklist

Do these items before the developer returns:

### Code & Repository Hygiene
- [ ] Commit and push current Delivery Lead + AI layer hardening work (done as of d3e7b58)
- [ ] Create this `launch-readiness.md` and commit it
- [ ] Create a `docs/handoff-notes.md` with explicit “what to work on first”
- [ ] Ensure `main` builds cleanly (`npm run build`)
- [ ] Run full type check + lint

### Documentation
- [ ] Update `docs/roadmap-100-items.md` with current true status (especially 46-65 and 66-80)
- [ ] Document current demo-mode surface area (where is it still blocking real usage?)
- [ ] Document BAA/auth cutover status (Cognito vs Supabase)

### Known Issues Log
- [ ] Create `docs/known-issues.md` with the top 10 things that will break in real usage
- [ ] Tag all `isDemoMode()` guards that must be removed or made conditional for production

### Gravity Rails
- [ ] Decide priority (Internal Copilot first or External widget?)
- [ ] Add basic wiring of case context into the internal chat if not already strong
- [ ] Document required env vars for Gravity Rail

### Handoff Materials
- [ ] One-page “How to run a real end-to-end test with a new TPA” runbook
- [ ] List of high-leverage files the new dev should study first

---

## Prioritized Path to Real Launch

### Phase 0 — Stabilize & Handoff (Now → Tuesday)
- Complete the checklist above
- Hand clean baseline to returning developer

### Phase 1 — Production Infrastructure (Highest Risk)
1. Finish BAA-compliant auth + data layer cutover (Cognito + RDS primary, Supabase fallback removed or isolated)
2. Remove or gate all remaining demo-mode shortcuts that would affect real customers
3. Get real Anthropic + external services working behind proper secrets

### Phase 2 — Core Product Hardening
1. Close AI feedback loops (human determinations actually improve future briefs)
2. Add AI signal weighting to case assignment / pod routing
3. Make Internal Copilot genuinely useful during review
4. End-to-end testing with real (non-demo) TPA data

### Phase 3 — Gravity Rails & Polish
- Decide and execute on Gravity Rail scope
- Operational tooling (monitoring, alerting, runbooks)
- Edge cases, mobile, accessibility, performance

### Phase 4 — Soft Launch → Full Launch
- Limited pilot with 1-2 friendly TPAs
- Concierge team training
- Full production cutover

---

## Major Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| BAA / Auth cutover incomplete | Critical | Must be resolved before any real customer data |
| Still too much demo-mode logic | High | Systematic removal or clear production paths |
| Gravity Rail scope unclear | Medium | Decision needed this week |
| AI not yet learning from humans | Medium | Feedback loop closure is high value |
| Limited real-world testing | High | Need at least one full non-demo case journey before launch |

---

## Handoff Notes for Returning Developer

**Priority Order When You Return:**

1. Read this document + `docs/roadmap-100-items.md`
2. Study the Brief Engine (`lib/generate-brief.ts`, `lib/fact-checker.ts`, `lib/denial-strength.ts`)
3. Understand the current auth guard + demo-mode boundaries
4. Clarify Gravity Rails direction with leadership
5. Focus on either:
   - Completing the BAA/auth cutover, **or**
   - Making the Internal Copilot useful in real case reviews

**Files You Should Touch Last (unless asked):**
- Delivery Lead dashboard (recently stabilized)
- Core Concierge validation flow (very solid)

---

## Open Questions for Leadership

1. What is the hard launch date target (even if soft launch)?
2. How important is Gravity Rail (external) for the initial launch vs. the internal Copilot?
3. Do we have real test TPA data / accounts we can use this week?
4. What is the current status of the Cognito + RDS production environment?
5. Who owns final sign-off on BAA/compliance readiness?

---

**Next Action**

I am ready to immediately:
- Expand any section above with more detail
- Create the supporting checklists and handoff files
- Start executing specific items from the Pre-Tuesday list
- Dive deeper into Gravity Rails wiring

Just tell me where you want to go first.
# Remaining Work for Returning Developer

**Prepared:** 2026-05-21  
**Context:** Developer returning Tuesday. Repo has been stabilized with new launch planning docs.

---

## Goal

Turn the current strong groundwork into a **shippable product** that real TPAs and concierges can use.

We have done the heavy lifting on the clinical workflow. The remaining work is mostly:
- Production infrastructure & reliability
- Closing the AI intelligence loop
- Gravity Rails
- Real-world hardening and testing

---

## Priority Order (Recommended)

### Tier 1 — Must Resolve Before Real Launch (Highest Risk)

1. **BAA / Auth / Data Layer Cutover**
   - Finish moving primary auth to Cognito.
   - Make RDS the primary data store.
   - Remove or properly isolate remaining Supabase dependencies for production paths.
   - Ensure `isDemoMode()` no longer silently enables real customer flows.

2. **Remove Demo Mode Contamination from Critical Paths**
   - Systematically audit and harden every `isDemoMode()` guard that affects:
     - Case submission
     - Brief generation
     - Notifications
     - Assignment
     - Determination

3. **Close the AI Feedback Loop**
   - Make human determinations + required rationales actually influence future brief generation (few-shot examples, scoring adjustments, or prompt augmentation).
   - Wire `physician_ai_agreement` and rationale data back into the generation pipeline.

4. **Make Internal AI Copilot (Gravity Rail Internal) Useful**
   - Improve context passed to `CopilotSidebar` / chat system.
   - Add high-value actions (explain brief section, suggest rationale language, flag documentation gaps).

### Tier 2 — High Value for Launch Quality

5. **Add AI Signals to Routing & Assignment**
   - Update `pod-assignment-engine.ts` and LPN/RN scoring to consider fact_check score, complexity, and appeal likelihood.
   - Surface high-risk cases in Delivery Lead and review queues.

6. **Production Hardening of Brief Engine**
   - Add better error handling, retry logic, and observability around multi-pass generation.
   - Track token usage and average passes per case.
   - Improve quality of `performSelfCritique` outputs.

7. **Real End-to-End Testing with Live Data**
   - Create repeatable process for testing a full case journey with a real (non-demo) TPA, real documents, and real clinical review.

8. **Gravity Rails External Decision & Integration**
   - Decide scope for the external Gravity Rail platform.
   - Wire the floating widget if it adds value for TPAs or operations.

### Tier 3 — Polish & Operational Readiness

9. Delivery Lead surface — add AI quality signals (low fact-check cases, high revision count, etc.).

10. Operational runbooks (case promotion, bad brief recovery, reassign under load, etc.).

11. Monitoring & alerting (Sentry, CloudWatch, error budgets).

12. Design system completion across remaining high-traffic pages.

13. Mobile / accessibility / edge case hardening.

---

## Quick Wins (Can Be Done Early)

- Update `docs/roadmap-100-items.md` to reflect honest current status (many phases are "built" but not yet "production-hardened").
- Flesh out the Internal Copilot chat experience with better prompts and case context.
- Add a simple "AI Quality" dashboard or section visible to Delivery Leads.
- Improve error messages during brief generation and reassign flows.

---

## Files You Should Study First

1. `docs/launch-readiness.md`
2. `docs/known-issues.md`
3. `lib/generate-brief.ts` + `lib/fact-checker.ts`
4. `lib/auth-guard.ts` + `lib/demo-mode.ts`
5. `app/delivery-lead/page.tsx` (recently hardened — use as reference for quality bar)
6. `components/chat/CopilotSidebar.tsx` and related chat components

---

## Open Decisions Needed From Leadership (You Should Surface These)

- Priority between Internal Copilot vs External Gravity Rail for initial launch.
- Hard target date for soft launch.
- How much real (non-demo) testing must happen before any customer sees the system.
- Who owns final BAA/compliance sign-off.

---

**Bottom Line**

The clinical logic and human gates are in good shape. The hard remaining work is making the system reliable, compliant, and intelligent enough to run in production with real data and real people.

Focus on Tier 1 first. Everything else becomes much easier once the foundation is solid.

Welcome back. Let's get this launched.
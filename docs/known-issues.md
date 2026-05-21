# VantaUM Known Issues & Production Risks

**Last Updated:** 2026-05-21  
**Purpose:** Living list of things that will break or cause problems when real TPAs start using the system.

---

## Critical (Will Break Real Usage)

1. **Heavy Demo Mode Contamination**
   - Large portions of the app still short-circuit via `isDemoMode()`.
   - Notifications, data loading, auth fallbacks, and some business logic behave differently in demo vs real.
   - **Risk:** Real cases may not trigger emails, assignments, or proper persistence.

2. **Auth & Database Cutover Incomplete**
   - Still running with Supabase as primary in many paths.
   - Cognito + RDS (BAA path) wiring is partial.
   - `ENABLE_AWS_DB` and related env vars are not fully enforced everywhere.

3. **Real Anthropic / LLM Calls Not Fully Exercised**
   - Most development and testing has been in demo mode.
   - Token usage, latency, error rates, and cost under real load are unknown.

4. **No Production Monitoring or Alerting**
   - No Sentry, no CloudWatch alarms, no error budget tracking.
   - Brief generation failures or case submission errors can go unnoticed.

---

## High (Will Cause Bad Experience or Support Load)

5. **AI Feedback Loop Not Closed**
   - Human determinations and rationales are captured in some places, but almost never used to improve future brief generation.
   - The "AI gets better over time" promise is not yet real.

6. **Case Assignment Ignores AI Signals**
   - `pod-assignment-engine.ts` and LPN/RN assignment still use only capacity and service category.
   - High-risk or low-quality-brief cases are not automatically surfaced or routed differently.

7. **Gravity Rail Integration Is Scaffolding Only**
   - Internal Copilot has limited case context awareness.
   - External Gravity Rail widget is not wired into any meaningful workflow.
   - No defined use cases or success metrics yet.

8. **Limited Real End-to-End Testing**
   - Almost no cases have gone through the full journey with real (non-demo) TPA data, real documents, and real clinical reviewers.

9. **Delivery Lead Tools Are New**
   - Reassign flow, risk visibility, and quality flags have only been used in simulation.
   - Behavior under real pod load is untested.

---

## Medium (Annoying but Survivable for Soft Launch)

10. **Inconsistent Design System Adoption**
    - Some pages are on the new `PageDashboard` / `PageHero` primitives, many are not.
    - Visual and interaction debt is growing.

11. **Concierge and Clinical Review UX Still Verbose**
    - Required rationale fields are good for defensibility but can feel heavy during high-volume periods.

12. **Notification Reliability**
    - Many notification paths still have demo guards or incomplete templates.

13. **Error Messages and Loading States**
    - Several flows have poor UX when things go wrong (especially during brief generation or reassign).

---

## Technical Debt / Future Polish

- No systematic prompt versioning or A/B testing for the Brief Engine.
- No cost tracking or token budget enforcement on Anthropic calls.
- `physician_ai_agreement` and feedback data exists but is under-analyzed.
- Mobile experience for TPA portal and case review is untested.
- No formal runbooks for common operational tasks (promoting a case, handling a bad brief, reassigning under load).

---

## How to Use This Document

- Treat every item in the "Critical" and "High" sections as blockers or near-blockers for a real launch.
- The returning developer should be pointed at this list on Day 1.
- We should review and update this document weekly until launch.

**Owner:** First chair (Grok) until further notice.
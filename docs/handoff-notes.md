# VantaUM Developer Handoff Notes

**Prepared for:** Returning Developer  
**Date:** 2026-05-21  
**From:** Grok (first chair)

---

## Welcome Back

You've walked into a codebase that has made **real progress** on the core clinical workflow. The product is no longer just a prototype — there is a functioning Brief Engine, required human reasoning gates, Delivery Lead tooling, and scaffolding for AI assistance.

Your job is to help turn this from "impressive in demo" into "ready for real TPAs and concierges."

---

## First 3 Things You Should Do

1. **Read These Documents (in order)**
   - `docs/launch-readiness.md` (this is the current master plan)
   - `docs/known-issues.md` (what will actually break)
   - `docs/roadmap-100-items.md` (overall scope and current claimed status)

2. **Explore the Core AI Brain**
   - `lib/generate-brief.ts`
   - `lib/fact-checker.ts`
   - `lib/denial-strength.ts`
   - `lib/two-midnight-rule.ts`

   These four files are the heart of the product. Understand how a brief is generated, fact-checked, self-critiqued, and how risk signals are produced.

3. **Understand the Demo vs Real Boundary**
   - Search for `isDemoMode()` across the codebase.
   - Look at `lib/demo-mode.ts`.
   - Understand where real paths are protected vs. where demo shortcuts still exist.

---

## Recommended First Projects (Choose With Leadership)

**High Leverage Options:**

**A. Production Infrastructure (Highest Risk)**
- Finish the Cognito + RDS (BAA) cutover.
- Systematically reduce `isDemoMode()` surface area.
- Make real Anthropic calls the default in non-demo environments.

**B. AI Feedback & Intelligence Loop**
- Close the loop so human determinations and rationales actually improve future briefs.
- Add AI signal weighting to case assignment / pod routing.

**C. Gravity Rails (Internal Copilot First)**
- Make the `CopilotSidebar` genuinely useful during case review.
- Improve context passed to the chat (current brief, fact-check results, risk signals, prior rationale).

**D. End-to-End Real Testing**
- Build a repeatable way to run a full non-demo case journey with real documents.

---

## What Has Been Recently Hardened (Touch Carefully)

- Delivery Lead Dashboard (`app/delivery-lead/page.tsx`)
- Reassign flow with required human reason
- Pod summary and workload views
- Quality / second-look flagging (now writes real audits)

These were just brought to a higher standard. Coordinate before making big changes.

---

## What Is Still Very Demo-Heavy

- Most notification paths
- A lot of the data layer and auth
- Gravity Rail integration
- Real-world load on the Brief Engine

---

## Communication

- Use the Mesh when coordinating with Grok (I'm currently first chair).
- When in doubt, read the invariants in the launch plan: **"AI does 95%, humans own the clinical defensibility with required reasoning."**

---

## Quick Reference — Important Files

| Purpose | Key Files |
|---------|-----------|
| Brief Generation | `lib/generate-brief.ts`, `lib/fact-checker.ts` |
| Risk & Scoring | `lib/denial-strength.ts` |
| Human Gates | `components/DeterminationForm.tsx`, `components/ConciergeValidationForm.tsx` |
| Delivery Leadership | `app/delivery-lead/page.tsx`, `app/api/delivery/concierges/route.ts` |
| Auth & Roles | `lib/auth-guard.ts`, `lib/demo-mode.ts` |
| Gravity Rail | `lib/gravity-rails.ts`, `components/GravityRailChat.tsx`, `components/chat/CopilotSidebar.tsx` |
| Case Lifecycle | `app/cases/[id]/page.tsx`, `app/api/cases/...` routes |

---

## Final Note

The user has done real work and is pushing hard to ship. The bar is high but the foundation is there.

Don't be afraid to ask clarifying questions early. It's better to align on direction than to build the wrong thing.

Welcome back — let's get this thing launched.
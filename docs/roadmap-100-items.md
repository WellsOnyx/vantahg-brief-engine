# VantaUM — 100-Item V1 Roadmap (Authoritative List)

This is the master prioritized list. Do not lose this again.

## Phase 0 — Foundations (1–4)
✅ 1. Set up proper GitHub + Vercel + AWS access for real development
(GitHub PAT working, Vercel token working, AWS CLI credentials persisting across terminals via ~/.zshrc)

✅ 2. Clean up duplicate branches and lock main as the single source of truth

✅ 3. Update contract template to match approved framework (Florida + Jonathan Arias as Co-Chair, COO, and General Counsel)

✅ 4. Improve contract generation logic to support admin-injected language

## Phase 1 — TPA Onboarding & Contract Flow (5–20)
5. Build admin review screen for signup requests (/admin/signups)

6. Add ability for admin to generate contract from a signup request

7. Wire contract generation to HelloSign/Dropbox Sign sending

8. Build basic TPA portal shell (/portal/tpa)

9. Create protected route access for approved TPAs

10. Build TPA case submission form (using existing CaseUploadForm)

11. Allow TPA to upload supporting documents on case submission

12. Store submitted cases with proper tenant scoping

13. Show TPA their submitted cases list in the portal

14. Add basic status tracking for cases in the TPA portal

15. Create initial concierge assignment on signup approval

16. Build basic “My Cases” view for TPAs

17. Add email notification when a contract is sent for signature

18. Add email notification when a TPA signs the contract

19. Wire post-signature provisioning (create tenant access)

20. Test full TPA signup → contract → signature → portal access flow end-to-end

## Later Phases (summary)
21–45: Concierge Core Workflow (intake → determination → first appeal)
46–65: AI Automation Layer
66–80: Delivery Leadership & Operations
81–100: Polish, Scale & V1 Hardening

Last updated: 2026-05-18 (captured from user after compaction loss)

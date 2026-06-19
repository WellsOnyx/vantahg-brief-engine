# VantaUM — AI-Powered Utilization Review Platform

> **‼️ Before doing anything else, read [`STATE.md`](STATE.md).** It's the live status of the build — what's shipped, what's in flight, what's locked. This file is the high-level project description. STATE.md is the truth.

## What this is
VantaUM automates the middle of healthcare prior authorization: human concierge intake (Chewy-style CSRs) + human clinician determinations, with AI handling OCR, data extraction, clinical brief generation, deduplication, routing, and SLA tracking.

Scale target: 333k supported lives (~41,625 monthly auths, ~1,400/day).

## Tech stack (current as of 2026-05-13)
- **Framework:** Next.js 16 App Router, TypeScript 5, Tailwind CSS 4
- **Authenticated app:** AWS Fargate at `https://app.vantaum.com` (live)
- **Marketing site:** Vercel at `https://vantaum.com` (stays on Vercel forever)
- **Database:** Hybrid — Supabase Postgres + RDS Postgres both deployed. App routes through `lib/db/supabase-shim.ts` so swapping is one env flag.
- **Storage:** Adapter pattern at `lib/adapters/storage` — Supabase or S3 via `ENABLE_AWS_STORAGE`
- **Auth:** Supabase Auth (V1). Cognito + magic-link Lambdas deployed but not cutover.
- **AI:** Anthropic Claude API
- **OCR:** Google Cloud Vision (REST, no SDK)
- **eFax:** Phaxio/Sinch (HMAC-SHA256 webhooks)
- **Billing:** Meow — locked decision, NOT Stripe. Code shipped; runtime config in flight (see STATE.md)
- **Clinical criteria:** VantaUM's OWN criteria engine (`lib/criteria/library.ts` + Cole's `lib/medical-qualifications/` RAG) — locked decision 2026-06-12, NOT InterQual/MCG. Never propose licensing a commercial criteria product.
- **Cron:** Vercel Cron + AWS EventBridge (both running)
- **Testing:** Vitest, 211/211 passing
- **Monitoring:** Sentry (slot wired, not yet sending)

## Key commands
```bash
npm run dev          # Local dev server
npm run build        # Production build
npm run test         # Vitest watch mode
npm run test:ci      # Vitest single run (CI)
npm run lint         # ESLint
```

## Project structure
```
app/                    # Next.js App Router pages + API routes
  api/intake/efax/      # eFax webhook endpoints (generic + Phaxio)
  api/cron/efax-process # Async eFax worker (claims batch, OCR, AI extract, dedup)
  cases/                # Case management UI
  dashboard/            # Main dashboard
  intake/               # Intake queue UI
lib/                    # Shared utilities
  intake/efax/          # eFax pipeline: OCR, AI extractor, storage, Phaxio adapter
  chat/                 # Chat/extraction engine
supabase/migrations/    # Numbered SQL migrations (000-008)
__tests__/              # Vitest tests mirroring lib/ structure
docs/                   # Setup guides and handoff docs
```

## Architecture decisions
- **Async eFax pipeline:** Webhook stores to `efax_queue` and returns 200 in <100ms. Cron worker claims batches with `FOR UPDATE SKIP LOCKED` for concurrent safety. Eager status writes between every step for crash recovery.
- **Pluggable OCR:** `selectOcrProvider()` picks Google Vision, provider-native, or demo based on env vars.
- **AI extraction with fallback:** Claude tool-use extracts structured clinical data; regex fallback if AI fails.
- **Dedup via fingerprint:** SHA-256 of normalized (patient_name, DOB, member_id, procedure_codes, from_number). 24-hour sliding window.
- **Demo mode:** When `NEXT_PUBLIC_DEMO_MODE=true` or Supabase env vars are missing, everything works with deterministic stub data. No external services needed.

## Conventions
- All database access uses Supabase client (`lib/supabase.ts` for server, `lib/supabase-browser.ts` for client)
- API routes use `NextResponse` and handle errors without throwing to external callers
- Rate limiting via `lib/rate-limit-middleware.ts`
- Auth guard via `lib/auth-guard.ts`
- HIPAA audit logging via `lib/audit.ts` — never log raw PHI
- Styling: DM Serif Display (headings) + DM Sans (body), navy `#0c2340`, gold `#c9a227`

## What's built (production-ready)
1. eFax intake pipeline (Phaxio webhook -> OCR -> AI extraction -> dedup -> case creation)
2. Clinical brief generation engine
3. Case management + determination workflow
4. Dashboard + command center
5. Demo mode (full platform works without any external services)
6. CSR triage UI — `/intake` "CSR Triage" tab handles `manual_review` and `dead_letter` eFax rows. Auth-gated to INTERNAL_STAFF_ROLES, side-by-side editable-extraction + source-fax PDF preview (signed URL via `/api/intake/efax/queue/[id]/document`), raw OCR text panel, idempotent promote-to-case. Backed by `app/api/intake/efax/queue/route.ts` (GET/PATCH).
7. Determination letter delivery — `lib/pdf-generator.ts:generateDeterminationPdf` renders the formal letter; `lib/notifications/determination-delivery.ts:deliverDeterminationLetter` emails it as a PDF attachment via the EmailAdapter (attachments support added to `lib/adapters/email/types.ts`). `POST /api/cases/[id]/send-determination-email` and a "Send to TPA" button on `/cases/[id]/determination` trigger the send. Idempotent (case status `delivered` is the marker).
8. Onboarding kickoff calendar invite — `lib/calendar/ical-generator.ts` builds an RFC 5545 .ics file with a weekly RRULE; `lib/notifications/kickoff-invite.ts:sendKickoffInvite` emails it as a `text/calendar; method=REQUEST` attachment on onboarding completion. Hooked into `POST /api/onboarding` fire-and-forget after `body.complete` flips status to `completed`. Idempotent via `onboarding_data.kickoff.invite_sent_at` (JSONB — no migration needed).
9. Real PDF upload on case submission — `CaseUploadForm` accepts up to 5 PDF attachments per submission via a two-phase submit (create case → `POST /api/cases/[id]/documents` multipart). Files persist through the existing storage adapter to the `efax-documents` bucket under `cases/<id>/<ts>-<filename>`. Per-file validation (PDF only, 10 MB cap) with typed `accepted[]` / `rejected[]` response so partial-success surfaces inline. `cases.submitted_documents` is appended in order.
10. Submitted-documents download view — `/cases/[id]` Documents card now renders each entry in `submitted_documents[]` as a click-to-download button backed by `GET /api/cases/[id]/documents/sign`. The endpoint mints a 5-min signed URL via the storage adapter after passing a two-stage guard (path must live in `cases/<caseId>/`, must appear in `submitted_documents[]`). Both bad-path branches return identical 404s so the response never leaks whether a file exists elsewhere; security events fire on both. Filenames display stripped of the upload-timestamp prefix.
11. SLA-aware LPN selection — `lib/delivery/lpn-scoring.ts:scoreLpnForCase` computes `slack_hours = time_to_deadline − (activeCount + 1) * avg_turnaround` and picks the highest-scored LPN. `lib/pod-assignment-engine.ts` calls `pickLpnByScore` in place of the legacy `(load, turnaround)` sort. Falls back to legacy ordering when the case has no `turnaround_deadline`. The `pod_assigned` audit event now carries `sla_score / sla_slack_hours / expected_completion_hours` so missed SLAs can be investigated. Tunable knob: `LOAD_PENALTY_WEIGHT` (default 0.1).
12. Clinician day planner — `/clinician` "My Day" dashboard for LPNs/RNs. `lib/clinician/day-planner.ts:buildDayPlan` projects the clinician's personal queue onto the clock: earliest-deadline-first work order (EDF minimizes max lateness on a serial queue, so the feasibility verdict is provable, not heuristic), per-case projected finish + slack, day feasibility (`on_track` / `tight` / `at_risk`), and capacity utilization vs `max_cases_per_day`. Backed by `GET /api/clinician/summary?staff_id=` which composes the staff record, role-scoped active queue (LPN: `lpn_review`/`pend_missing_info`; RN: personal `rn_review` only — pod oversight stays in `/queue`), the plan, and a quality-audit summary. Sibling of `lib/delivery/lpn-scoring.ts` (same serial-throughput slack math, applied at work time instead of assignment time).
13. VantaUM Criteria Library (NOT InterQual/MCG — locked decision 2026-06-12) — `lib/criteria/library.ts` wraps the evidence-based `lib/medical-criteria.ts` content with versioned, provenance-stamped criteria sets (`VC-<code>-v<n>`, provenance `vantaum_criteria_library`) and a `CriteriaSource` contract that Cole's `lib/medical-qualifications/` RAG implements in production. `assessFromBrief()` rolls a brief's `criteria_match` into a met/not_met/partial/insufficient verdict. The brief-engine prompt and all demo `guideline_source` strings cite the VantaUM library + public evidence; commercial criteria are never presented as the basis of a review. `known-guidelines.ts` still recognizes InterQual/MCG names so the fact-checker can flag hallucinated citations.
14. Concierge ping center — every intake channel (eFax, Gravity Rails agent, live call, call center, client portal, manual entry) funnels into the same case engine; `lib/concierge/pings.ts:buildPings` surfaces active cases with no outbound first-contact touchpoint as "pings" (30-min callback target, most-overdue-first) with a `buildCallPrep` line so the concierge opens the call knowing the brief engine already prepared the auth. `GET /api/concierge/pings` + `POST /api/concierge/touchpoints` (migration `027_concierge_touchpoints.sql`, tenant-guarded, PHI-safe audit). "First call" feed + inline log-call form on `/concierge`.
15. Clinician day planner + decision-readiness — `/clinician` "My Day" dashboard for LPNs/RNs. `lib/clinician/day-planner.ts:buildDayPlan` projects the clinician's personal queue onto the clock: earliest-deadline-first work order (EDF minimizes max lateness on a serial queue, so the feasibility verdict is provable, not heuristic), per-case projected finish + slack, day feasibility (`on_track` / `tight` / `at_risk`), capacity vs `max_cases_per_day`. `GET /api/clinician/summary?staff_id=` composes the staff record, role-scoped queue (LPN: `lpn_review`/`pend_missing_info`; RN: personal `rn_review` only), the plan, a quality-audit summary, and per-case `readiness` (brief_ready, fact_check_score, `human_review_recommended` surfaced not suppressed, VantaUM criteria assessment, AI recommendation). ReadinessChip on the dashboard delivers delight without removing the human gate.
16. 350+ passing tests (prior counts + 12 criteria library + 14 day planner + 8 concierge pings + 5 concierge ping API + 6 clinician summary API)

## What's next
1. Provider portal (external-facing status checks)
2. Receipt-confirmation email wiring (the intake-confirmation notification helper exists but isn't dispatched from the eFax pipeline yet — blocked on schema for `requesting_provider_email`)
3. SLA-aware LPN scoring: tune `LOAD_PENALTY_WEIGHT` once production assignment data exists (currently 0.1, set by synthetic-test-driven defaults)
4. TPA system connector framework (FHIR / X12 EDI) — start with one specific connector once the first TPA's TPA-system is known

## Environment variables
See `.env.local.example`. For the eFax pipeline, also need:
- `PHAXIO_CALLBACK_TOKEN` — Phaxio webhook signature verification
- `PHAXIO_API_KEY` / `PHAXIO_API_SECRET` — Phaxio media download auth
- `GOOGLE_VISION_API_KEY` — Google Cloud Vision OCR
- `CRON_SECRET` — Bearer token for Vercel Cron endpoints

## For new contributors
1. Clone the repo
2. `npm install`
3. Copy `.env.local.example` to `.env.local`
4. For demo mode: just run `npm run dev` — no env vars needed
5. For full mode: fill in Supabase + Anthropic + Phaxio + Vision keys
6. Run `npm run test:ci` to verify everything passes
7. Read `docs/handoff-cole.md` for detailed onboarding

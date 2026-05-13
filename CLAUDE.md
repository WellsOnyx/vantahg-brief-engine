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
6. 100 passing tests

## What's next
1. CSR triage UI — screen for `manual_review` / `dead_letter` eFax rows
2. Email notification delivery (receipt confirmations, determination letters)
3. Determination letter PDF rendering
4. Provider portal (external-facing status checks)
5. Quality audit dashboard
6. Pod-based reviewer assignment optimization

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

# VantaUM Handoff — Cole Onboarding

Welcome to VantaUM. This doc gets you productive fast.

## TL;DR

VantaUM is a healthcare prior authorization platform. We automate the middle — human intake + human clinician determination, AI handles everything between. Your Claude Code session will read `CLAUDE.md` at the repo root for full architecture context.

## Getting started

```bash
# 1. Clone
git clone git@github.com:WellsOnyx/vantahg-brief-engine.git
cd vantahg-brief-engine

# 2. Install
npm install

# 3. Demo mode (no env vars needed)
npm run dev
# Open http://localhost:3000

# 4. Run tests
npm run test:ci
# Expected: 100 tests passing across 13 files
```

## Full mode setup (when you have credentials)

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (keep secret) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `PHAXIO_CALLBACK_TOKEN` | Phaxio dashboard → Account → Callback Token |
| `PHAXIO_API_KEY` | Phaxio dashboard → API Credentials |
| `PHAXIO_API_SECRET` | Same |
| `GOOGLE_VISION_API_KEY` | Google Cloud Console → APIs & Services → Credentials |
| `CRON_SECRET` | Generate with `openssl rand -hex 32` |

## What's already built

### eFax Pipeline (the big one, just shipped)
The full async eFax intake pipeline:

```
Fax arrives at Phaxio
  → Phaxio POSTs webhook to /api/intake/efax/phaxio
  → We verify HMAC signature, store to efax_queue, return 200 in <100ms
  → Cron worker (/api/cron/efax-process) runs every minute
  → Claims batch with FOR UPDATE SKIP LOCKED
  → Downloads PDF from Phaxio, stores in Supabase Storage
  → Google Cloud Vision OCR → raw text
  → Claude AI extracts structured clinical data (patient, diagnosis, procedures, etc.)
  → SHA-256 fingerprint dedup check (24hr window)
  → Creates case or flags for manual review
  → Sends receipt confirmation
```

Key files:
- `lib/intake/efax/ocr.ts` — Pluggable OCR adapter
- `lib/intake/efax/ai-extractor.ts` — Claude tool-use extraction with regex fallback
- `lib/intake/efax/storage.ts` — Document storage + dedup fingerprinting
- `lib/intake/efax/providers/phaxio.ts` — Phaxio webhook verification + parsing
- `app/api/intake/efax/phaxio/route.ts` — Phaxio webhook endpoint
- `app/api/cron/efax-process/route.ts` — Async batch worker
- `supabase/migrations/008_efax_pipeline.sql` — DB schema for the pipeline

### Other systems
- **Clinical brief generation** (`lib/generate-brief.ts`, `lib/claude.ts`)
- **Case management** (`app/cases/`)
- **Dashboard + command center** (`app/dashboard/`, `app/command-center/`)
- **Determination workflow** (`app/cases/[id]/determination/`)
- **Demo mode** — everything works with stub data, no external services

## Where to contribute

### Python services
If you're building Python services (batch jobs, ML pipelines, EDI integrations), create a `/services/python/` directory. Connect to the same Supabase Postgres — use `supabase-py` or `psycopg2`/`SQLAlchemy` directly.

### Immediate priorities
1. **CSR Triage UI** — screen for Chewy-style CSRs to review `manual_review` / `dead_letter` eFax rows
2. **Email notifications** — receipt confirmations + determination letters via Resend or Postmark
3. **Determination letter PDF** — templates → PDF rendering
4. **Provider portal** — external-facing auth status lookup

## Database

Postgres via Supabase. Migrations are in `supabase/migrations/` (000-008). Key tables:
- `cases` — authorization requests
- `efax_queue` — eFax processing pipeline (statuses: received → fetching → ocr_processing → extracting → completed/manual_review/dead_letter)
- `clients` — payer/provider organizations
- `reviewers` — clinical reviewers
- `audit_log` — HIPAA compliance trail

## Conventions
- TypeScript for frontend + API routes
- Vitest for tests (`__tests__/` mirrors `lib/`)
- Never log raw PHI — use `lib/audit.ts`
- Styling: DM Serif Display headings, DM Sans body, navy #0c2340, gold #c9a227
- API routes return 200 and handle errors gracefully (never throw to external callers)

## Questions?
Ask your Claude Code — it reads `CLAUDE.md` and has full context. Or check `docs/efax-setup.md` for the eFax-specific operator guide.

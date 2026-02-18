# VantaHG Clinical Brief Engine

AI-powered utilization review platform for healthcare compliance. Built for payers, TPAs, and IROs who need fast, defensible clinical determinations backed by board-certified physicians.

**Demo**: [vantahg-brief-engine.vercel.app](https://vantahg-brief-engine.vercel.app)

---

## What It Does

VantaHG takes clinical documentation submissions and generates structured AI-powered briefs that assist board-certified physicians in making utilization review determinations. The AI analyzes — physicians decide.

### Core Workflow

1. **Client submits case** — Upload clinical docs, select procedure codes, enter patient info
2. **AI analyzes documentation** — Claude analyzes clinical necessity against evidence-based criteria
3. **Physician reviews brief** — Board-certified physician reviews AI brief with criteria match analysis
4. **Determination issued** — Approve, deny, pend, or schedule peer-to-peer review

### Key Principle

> All clinical determinations are made by licensed, board-certified physicians. AI technology is used solely to assist in clinical documentation analysis and does not make coverage decisions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Database | Supabase (PostgreSQL + RLS) |
| AI | Anthropic Claude API (claude-sonnet-4-5-20250514) |
| Styling | Tailwind CSS v4 |
| Fonts | DM Serif Display (headings) + DM Sans (body) |
| Deployment | Vercel |
| Brand | Navy #0c2340, Gold #c9a227 |

---

## Pages & Routes

### Client-Facing
| Route | Description |
|-------|-------------|
| `/` | Landing page — hero, how it works, trust metrics, case dashboard |
| `/upload` | 4-step case submission wizard with drag-drop file upload |
| `/portal` | Case status tracker with visual progress steppers |

### Internal / Reviewer
| Route | Description |
|-------|-------------|
| `/cases/[id]` | Case detail — AI brief, metadata, determination form, audit trail |
| `/cases/[id]/brief` | Printable one-page clinical brief with signature line |
| `/cases/new` | Internal case intake form |
| `/reviewers` | Physician reviewer panel management |
| `/clients` | Client/payer management |

### API Routes
| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/cases` | GET, POST | List/create cases |
| `/api/cases/[id]` | GET, PATCH | Get/update single case |
| `/api/cases/[id]/audit` | GET | Audit log for a case |
| `/api/generate-brief` | POST | Trigger AI brief generation |
| `/api/reviewers` | GET, POST | List/create reviewers |
| `/api/reviewers/[id]` | GET, PATCH | Get/update reviewer |
| `/api/clients` | GET, POST | List/create clients |
| `/api/clients/[id]` | GET, PATCH | Get/update client |
| `/api/webhooks` | POST | Webhook endpoint (stub) |

---

## Demo Mode

The app runs in **demo mode** when `NEXT_PUBLIC_SUPABASE_URL` is not set. In demo mode:

- All API routes return realistic hardcoded data (6 dental cases, 3 reviewers, 3 clients)
- No database connection required
- Perfect for conference demos and local development
- Cases span all workflow stages (submitted through determination)
- AI briefs include real clinical language and criteria analysis

Demo mode is controlled by `lib/demo-mode.ts` with data in `lib/demo-data.ts`.

---

## Setup

### Prerequisites
- Node.js 18+
- npm or pnpm

### Quick Start (Demo Mode)

```bash
git clone https://github.com/WellsOnyx/vantahg-brief-engine.git
cd vantahg-brief-engine
npm install
npm run dev
```

No env vars needed — runs in demo mode automatically.

### Full Setup (With Database + AI)

1. **Create Supabase project** at supabase.com or via CLI

2. **Run the schema**:
   ```bash
   # Via Supabase SQL editor or psql
   psql -h <your-db-host> -U postgres -f supabase/schema.sql
   ```

3. **Create `.env.local`**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ANTHROPIC_API_KEY=sk-ant-your-key
   ```

4. **Run**:
   ```bash
   npm run dev
   ```

### Deploy to Vercel

1. Import the GitHub repo in Vercel
2. Add all 4 env vars in project settings
3. Deploy — Vercel auto-detects Next.js

---

## Database Schema

Four tables in Supabase with Row Level Security enabled:

- **`cases`** — Patient info, procedure codes, clinical docs, AI brief, status, determination
- **`reviewers`** — Physician panel (name, credentials, specialty, case count)
- **`clients`** — Payers/TPAs/IROs (name, type, contact info)
- **`audit_log`** — Immutable audit trail (every action timestamped with actor)

Schema file: `supabase/schema.sql`

---

## Medical Criteria Library

First-level medical utilization review with CPT/HCPCS codes across all major service categories:

| Code | Procedure | Category |
|------|-----------|----------|
| 72148 | MRI Lumbar Spine without Contrast | Imaging |
| 70553 | MRI Brain with and without Contrast | Imaging |
| 74177 | CT Abdomen and Pelvis with Contrast | Imaging |
| 27447 | Total Knee Arthroplasty (TKA) | Surgery |
| 29881 | Knee Arthroscopy with Meniscectomy | Surgery |
| 63030 | Lumbar Discectomy / Decompression | Surgery |
| 64483 | Transforaminal Epidural Steroid Injection | Pain Management |
| E0601 | CPAP Device | DME |
| 96413 | Chemotherapy IV Infusion (first hour) | Oncology |
| J1745 | Infliximab (Remicade) Injection | Infusion |
| 90837 | Psychotherapy (53+ minutes) | Behavioral Health |
| 97110 | Therapeutic Exercise | Rehab Therapy |
| G0151 | Home Health Physical Therapy | Home Health |
| 81528 | Oncotype DX Breast Recurrence Score | Genetic Testing |

Plus 36 additional commonly reviewed CPT/HCPCS codes in the intake form dropdown (50 total).

Library: `lib/medical-criteria.ts`

---

## Architecture Notes

- **Lazy Supabase client** via Proxy pattern — avoids build-time crashes when env vars aren't set
- **Service role client** (`getServiceClient()`) used in API routes for full database access
- **`force-dynamic`** on all API routes — prevents static generation attempts
- **AI brief structure**: clinical_question, patient_summary, procedure_analysis, criteria_match, documentation_review, ai_recommendation, reviewer_action
- **Audit logging**: Every state change logged with actor, action, timestamp, and details

---

## HIPAA Readiness

Built with compliance rails for future HIPAA certification:

- Row Level Security (RLS) enabled on all tables
- Audit logging on every action
- Service role key separated from anon key
- No PHI exposed in client-side code
- All data flows through server-side API routes
- Ready for Supabase Pro BAA signing

---

## File Structure

```
vantahg-brief-engine/
  app/
    api/              # 9 API route files
    cases/            # Case detail, brief, intake pages
    clients/          # Client management page
    portal/           # Client-facing case tracker
    reviewers/        # Reviewer management page
    upload/           # Client upload wizard
    globals.css       # Tailwind v4 theme + animations
    layout.tsx        # Root layout with nav + footer
    page.tsx          # Landing page + dashboard
  components/         # 8 shared UI components
  lib/
    types.ts          # TypeScript types
    supabase.ts       # Lazy Supabase client
    claude.ts         # Anthropic SDK integration
    generate-brief.ts # AI brief generation pipeline
    medical-criteria.ts # CPT/HCPCS criteria library
    audit.ts          # Audit logging helper
    demo-data.ts      # Demo dataset (6 cases, 3 reviewers, 3 clients)
    demo-mode.ts      # Demo mode utilities
    notifications.ts  # SMS stub (Twilio)
  supabase/
    schema.sql        # Full database schema
```

---

## Built By

[Wells Onyx](https://github.com/WellsOnyx) | Powered by Anthropic Claude

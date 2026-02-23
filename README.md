# VantaHG Clinical Brief Engine

**AI-powered first-level utilization review for healthcare compliance.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red)](#license)

---

## What is VantaHG?

VantaHG is an AI-powered utilization review platform built for health plans, TPAs, IROs, and managed care organizations. It transforms clinical documentation into structured, evidence-based briefs that assist board-certified physicians in making coverage determinations. The platform handles the entire first-level review workflow -- from case intake through AI analysis, physician review, and determination delivery -- with full audit trails and compliance controls.

The core principle is simple: **AI analyzes, physicians decide.** VantaHG uses Anthropic Claude to generate clinical briefs that summarize patient documentation, match procedure codes against evidence-based criteria, and surface relevant guidelines. A deterministic fact-checking engine then verifies every AI-generated claim against known medical databases. All clinical determinations are made by licensed, board-certified physicians -- the AI never makes coverage decisions.

---

## Architecture Overview

```
                          +------------------+
                          |   Client / TPA   |
                          |  (Upload Portal) |
                          +--------+---------+
                                   |
                          +--------v---------+
                          |  Next.js 16 App  |
                          |   (App Router)   |
                          +--+-----+------+--+
                             |     |      |
                   +---------+  +--+--+   +---------+
                   |            |     |             |
            +------v-----+ +---v---+ +------v------+--------+
            | Anthropic   | | Supa- | | Fact-Check  | SLA    |
            | Claude API  | | base  | | Engine      | Calc   |
            | (Brief Gen) | | (DB)  | | (Determin.) | (Track)|
            +-------------+ +-------+ +-------------+--------+
```

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL + RLS) |
| AI | Anthropic Claude API (claude-sonnet-4-5-20250514) |
| Styling | Tailwind CSS v4 |
| Fonts | DM Serif Display (headings) + DM Sans (body) |
| Testing | Vitest + Testing Library |
| CI/CD | GitHub Actions |
| Error Monitoring | Sentry (scaffolded) |
| Deployment | Vercel |
| Brand | Navy `#0c2340`, Gold `#c9a227` |

---

## Features

- **AI Clinical Brief Generation** -- Claude generates structured briefs covering clinical question, patient summary, procedure analysis, criteria match, documentation review, and recommendation
- **Deterministic Fact-Checking Engine** -- 4 section verifiers and 4 consistency checks produce a 0-100 verification score with no AI calls
- **Medical Criteria Database** -- 14 detailed CPT/HCPCS codes with full criteria, denial reasons, and guideline references, plus 50 total codes in the intake dropdown
- **Known Guidelines Database** -- 24 recognized clinical guideline sources (InterQual, MCG, ACR, NCCN, CMS NCD/LCD, Cochrane, UpToDate, and more) for hallucination detection
- **SLA Calculator** -- Real-time deadline tracking with urgency levels (ok, caution, warning, critical, overdue) across 7 review types and 3 priority tiers
- **Demo Mode** -- Zero-dependency operation with 6 realistic cases, 3 reviewers, and 3 clients; no database or API keys required
- **Authentication** -- Supabase Auth with magic link sign-in, session refresh middleware, and login/signup pages
- **Role-Based Access Control** -- Three roles (admin, reviewer, client) enforced at both middleware and API route levels with RLS policies in the database
- **Rate Limiting** -- In-memory sliding-window rate limiter on all API endpoints with configurable limits per route
- **Batch Case Upload** -- Bulk create up to 500 cases in a single request with per-row validation and background brief generation
- **External API** -- API-key-authenticated endpoint for third-party integrations with full input validation
- **Audit Logging** -- Immutable audit trail on every state change with actor, action, timestamp, and details (SOC 2 CC6.1)
- **PHI Sanitization** -- Deep-clone redaction of patient_name, patient_dob, member_id, email, phone, and DEA numbers before logging
- **HMAC Webhook Verification** -- SHA-256 signature verification with constant-time comparison to prevent timing attacks
- **Sentry Error Monitoring** -- Client, server, and edge Sentry configs with source map upload in CI
- **Security Headers** -- CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Custom Error Pages** -- Branded 404 (not-found) and 500 (error/global-error) pages
- **Mobile-Responsive UI** -- Responsive layout with collapsible mobile navigation
- **PDF Export** -- Generate downloadable PDF clinical briefs via jsPDF
- **Compliance Dashboard** -- Audit log statistics, security event timeline, and compliance metrics (admin only)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/WellsOnyx/vantahg-brief-engine.git

# 2. Navigate to the project directory
cd vantahg-brief-engine

# 3. Install dependencies
npm install

# 4. Start the development server (runs in demo mode -- no env vars needed)
npm run dev

# 5. Open http://localhost:3000
```

No environment variables are required for demo mode. The app detects the absence of `NEXT_PUBLIC_SUPABASE_URL` and automatically switches to demo mode with realistic hardcoded data.

---

## Demo Mode

When `NEXT_PUBLIC_SUPABASE_URL` is not set, the application runs in **demo mode**:

- All API routes return realistic hardcoded data
- 6 medical utilization review cases spanning all workflow stages (intake through determination)
- 3 physician reviewers with board certifications and specialties
- 3 clients representing different payer types (TPA, health plan, managed care org)
- AI briefs include real clinical language, criteria analysis, and guideline references
- Fact-checking runs against the real criteria database
- No database connection, no API keys, no external dependencies
- Authentication is bypassed with a mock admin user

Demo mode is controlled by `lib/demo-mode.ts` with data in `lib/demo-data.ts`.

---

## Supabase Setup

### 1. Create a Supabase Project

Create a new project at [supabase.com](https://supabase.com) or via the Supabase CLI.

### 2. Run the Base Schema

Open the SQL Editor in your Supabase dashboard and run:

```sql
-- File: supabase/schema.sql
-- Creates tables: cases, reviewers, clients, audit_log
-- Creates indexes, triggers, and baseline RLS policies
```

Or via the command line:

```bash
psql -h <your-db-host> -U postgres -f supabase/schema.sql
```

### 3. Run the Auth Migration

After enabling Supabase Auth in your project, run the auth migration:

```sql
-- File: supabase/migrations/001_auth_rls.sql
-- Creates: user_profiles table, auto-profile trigger, role-based RLS policies
-- Replaces: permissive MVP policies with proper role-based access
```

### 4. Enable Auth Providers

In Supabase Dashboard > Authentication > Providers:

- Enable **Email** provider with magic link sign-in
- Optionally configure a custom SMTP sender for branded emails

### 5. Database Tables

| Table | Description |
|---|---|
| `cases` | Patient info, procedure/diagnosis codes, clinical docs, AI brief, fact-check results, determination, SLA tracking |
| `reviewers` | Physician panel -- name, credentials, specialty, board certifications, license states, case capacity |
| `clients` | Payers/TPAs/IROs -- name, type, contact info, contracted SLA hours, guideline preferences |
| `audit_log` | Immutable audit trail -- every action timestamped with actor and details |
| `user_profiles` | Extends `auth.users` with role assignment (admin, reviewer, client) |

---

## Vercel Deployment

### 1. Import Repository

In the Vercel dashboard, import the `WellsOnyx/vantahg-brief-engine` GitHub repository.

### 2. Set Environment Variables

Add the following in your Vercel project settings (Settings > Environment Variables):

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `VANTAHG_API_KEY` | No | API key for external submission endpoint |
| `WEBHOOK_SECRET` | No | HMAC secret for webhook signature verification |
| `SENTRY_DSN` | No | Sentry DSN for error monitoring |
| `SENTRY_ORG` | No | Sentry organization slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token for source map upload |

### 3. Deploy

Vercel auto-detects Next.js. No custom build configuration is needed -- the `vercel.json` is already configured.

---

## Authentication

### Auth Flow

1. User navigates to any protected route
2. Middleware checks for a valid Supabase session
3. If no session, user is redirected to `/login` with a `?redirect=` parameter
4. User enters their email and receives a magic link
5. Clicking the link authenticates the user and redirects to the original page
6. The middleware refreshes the session token on every request

### Roles

| Role | Permissions |
|---|---|
| `admin` | Full access to all cases, reviewers, clients, audit logs, batch upload, compliance dashboard |
| `reviewer` | Read/write access to cases, read own reviewer profile |
| `client` | Read-only access to their own cases |

### Route Protection

- **Middleware** (`middleware.ts`) -- Handles session refresh and page-level redirects
- **API Guard** (`lib/auth-guard.ts`) -- `requireAuth()` and `requireRole()` functions enforce authentication and authorization on every API route
- **Database RLS** (`supabase/migrations/001_auth_rls.sql`) -- Row Level Security policies enforce access at the database level
- **Public Routes** -- `/login`, `/signup`, `/api/health`, `/api/external/submit` are accessible without authentication

---

## API Reference

All API routes use `export const dynamic = 'force-dynamic'` and include rate limiting. Authentication is enforced via `requireAuth()` or `requireRole()` from `lib/auth-guard.ts`.

### Cases

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/cases` | admin, reviewer | 200/min | List all cases with optional filters |
| `POST` | `/api/cases` | admin, reviewer | 30/min | Create a new case |
| `GET` | `/api/cases/:id` | admin, reviewer | 200/min | Get a single case with reviewer and client joins |
| `PATCH` | `/api/cases/:id` | admin, reviewer | 30/min | Update case fields (status, determination, assignment) |
| `GET` | `/api/cases/:id/audit` | admin, reviewer | 200/min | Get the audit trail for a specific case |
| `POST` | `/api/cases/batch` | admin | 5/min | Batch create up to 500 cases with per-row validation |

### AI & Verification

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/generate-brief` | any authenticated | 10/min | Generate an AI clinical brief for a case |
| `POST` | `/api/fact-check` | any authenticated | 20/min | Run deterministic fact-check on an existing brief |

### Reviewers

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/reviewers` | admin | 200/min | List all physician reviewers |
| `POST` | `/api/reviewers` | admin | 30/min | Create a new reviewer |
| `GET` | `/api/reviewers/:id` | admin | 200/min | Get a single reviewer |
| `PATCH` | `/api/reviewers/:id` | admin | 30/min | Update reviewer fields |

### Clients

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/clients` | admin | 200/min | List all clients |
| `POST` | `/api/clients` | admin | 30/min | Create a new client |
| `GET` | `/api/clients/:id` | admin | 200/min | Get a single client |
| `PATCH` | `/api/clients/:id` | admin | 30/min | Update client fields |

### Compliance & Monitoring

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/compliance/audit-stats` | admin | 200/min | Aggregate audit log statistics (no PHI returned) |
| `GET` | `/api/health` | none | none | Health check -- returns status, version, database connectivity, uptime |

### External Integration

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/external/submit` | API key (`x-api-key` header) | 60/min | Submit a case from an external system with automatic brief generation |
| `POST` | `/api/webhooks` | HMAC (`x-webhook-signature` header) | 100/min | Receive webhook events with signature verification |

---

## AI Verification Engine

The fact-checking engine (`lib/fact-checker.ts`) runs **deterministically** -- no AI calls are made. It verifies every claim in an AI-generated clinical brief against known databases.

### Section Verifiers (4)

1. **Clinical Criteria Match** -- Cross-references cited criteria against the VantaHG medical criteria database. Verifies guideline sources against 24 known clinical guideline organizations. Detects potentially fabricated guidelines.
2. **Procedure & Diagnosis Codes** -- Validates CPT, HCPCS, and ICD-10 code formats. Cross-checks that brief codes match the case's submitted procedure codes.
3. **Documentation Review** -- Verifies that missing documentation items are also referenced in the additional info needed section for internal consistency.
4. **Recommendation & Reviewer Action** -- Checks state-specific requirement citations against recognized regulatory patterns (CMS NCD/LCD, CFR references, known organization abbreviations).

### Consistency Checks (4)

1. **Recommendation-Criteria Alignment** -- Flags when an "approve" recommendation has more unmet criteria than met, or a "deny" has all criteria met.
2. **Confidence-Uncertainty Alignment** -- Flags "high" confidence when 3+ criteria are unable to be assessed.
3. **Missing Documentation Impact** -- Flags when 3+ missing documents exist but the recommendation is "approve" with no additional info requested.
4. **Peer-to-Peer Necessity** -- Flags when P2P is suggested but the recommendation is "approve" with high confidence.

### Scoring

- Base score starts at 100
- Verified claims increase the verification ratio; flagged claims reduce it
- Each flag deducts 5 points; each failed consistency check deducts 10 points
- Final score is clamped to 0-100
- Overall status: **pass** (score >= 80, no flags, no failed checks), **warning** (intermediate), **fail** (score < 50, or 3+ flags, or 2+ failed checks)

---

## Medical Criteria Database

The platform includes a curated medical criteria database (`lib/medical-criteria.ts`) covering 14 detailed procedure codes across 10 service categories, plus 50 total commonly reviewed codes in the intake form.

### Detailed Criteria Codes (14)

| Code | Procedure | Category |
|---|---|---|
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
| 90837 | Psychotherapy, 53+ Minutes | Behavioral Health |
| 97110 | Therapeutic Exercise | Rehab Therapy |
| G0151 | Home Health Physical Therapy | Home Health |
| 81528 | Oncotype DX Breast Recurrence Score | Genetic Testing |

Each detailed code includes: typical approval criteria, common denial reasons, and guideline references.

### Guideline Sources

The known guidelines database (`lib/known-guidelines.ts`) includes 24 recognized sources across 4 categories:

- **Criteria Sets** -- InterQual, MCG (Milliman Care Guidelines), ACR Appropriateness Criteria
- **Specialty Societies** -- NCCN, AAOS, AAN, AASM, APA, ASIPP, AGA, AAD, ASCO, AHA/ACC, NASS
- **Government** -- CMS NCD, CMS LCD, CMS Benefit Policy Manual, CMS Home Health CoP, AHRQ, USPSTF
- **Evidence Review** -- Cochrane Reviews, Hayes HTA, ECRI Institute, UpToDate

---

## Security and Compliance

### HIPAA Readiness

- Row Level Security (RLS) enabled on all database tables
- Role-based access control at middleware, API, and database levels
- PHI sanitization on all audit log entries (`lib/security.ts`)
- Service role key isolated from client-side anon key
- No PHI exposed in client-side JavaScript
- All data flows through server-side API routes
- Ready for Supabase Pro BAA signing

### SOC 2 Controls

| Control | Implementation |
|---|---|
| CC6.1 -- Logical Access | Supabase Auth + role-based RLS + API auth guards |
| CC6.1 -- Audit Logging | Immutable `audit_log` table with actor, action, timestamp, details |
| CC6.6 -- Boundary Protection | CSP headers, HSTS, X-Frame-Options DENY, rate limiting |
| CC7.1 -- Availability Monitoring | `/api/health` endpoint with database connectivity check and uptime |
| CC7.2 -- Security Event Detection | Security events logged with `security:` prefix, surfaced in compliance dashboard |
| CC8.1 -- Change Management | GitHub Actions CI/CD pipeline with lint, typecheck, test, and build gates |

### Security Headers

Configured in `next.config.ts`:

- `Content-Security-Policy` -- Restricts script, style, image, font, and connect sources
- `Strict-Transport-Security` -- HSTS with 2-year max-age, includeSubDomains, preload
- `X-Frame-Options: DENY` -- Prevents clickjacking
- `X-Content-Type-Options: nosniff` -- Prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` -- Disables camera, microphone, geolocation

### Rate Limiting

In-memory sliding-window rate limiter (`lib/security.ts`, `lib/rate-limit-middleware.ts`) with:

- Per-IP, per-path limiting
- Configurable max requests and window duration per route
- Automatic cleanup of expired entries every 5 minutes
- `429 Too Many Requests` response with `Retry-After` header
- Security event logging on limit exceeded

---

## Testing

The project uses [Vitest](https://vitest.dev/) with jsdom and Testing Library.

```bash
# Run tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:ci
```

### Test Suite

9 test files with 63 test cases covering:

| Test File | Coverage |
|---|---|
| `__tests__/api/cases.test.ts` | Cases API route handler |
| `__tests__/api/generate-brief.test.ts` | Brief generation API |
| `__tests__/api/health.test.ts` | Health check endpoint |
| `__tests__/lib/demo-mode.test.ts` | Demo mode utilities |
| `__tests__/lib/fact-checker.test.ts` | Fact-checking engine verification |
| `__tests__/lib/known-guidelines.test.ts` | Guideline matching and regulatory format detection |
| `__tests__/lib/medical-criteria.test.ts` | Medical criteria database lookups |
| `__tests__/lib/security.test.ts` | PHI sanitization, rate limiting, request context |
| `__tests__/lib/sla-calculator.test.ts` | SLA deadline calculation and urgency classification |

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

```
Lint ──┐
       ├── Build (runs only after all three pass)
Type ──┤
Check  │
       │
Test ──┘
```

| Job | Command | Description |
|---|---|---|
| Lint | `npm run lint` | ESLint with Next.js config |
| Type Check | `npx tsc --noEmit` | Full TypeScript type verification |
| Test | `npm run test:ci` | Vitest in single-run mode |
| Build | `npm run build` | Next.js production build (runs only if lint, typecheck, and test pass) |

---

## Project Structure

```
vantahg-brief-engine/
  .github/
    workflows/
      ci.yml                    # GitHub Actions CI pipeline
  __tests__/
    api/
      cases.test.ts             # Cases API tests
      generate-brief.test.ts    # Brief generation tests
      health.test.ts            # Health endpoint tests
    lib/
      demo-mode.test.ts         # Demo mode tests
      fact-checker.test.ts      # Fact-checker tests
      known-guidelines.test.ts  # Guidelines DB tests
      medical-criteria.test.ts  # Medical criteria tests
      security.test.ts          # Security utilities tests
      sla-calculator.test.ts    # SLA calculator tests
  app/
    api/
      cases/
        [id]/
          audit/route.ts        # GET audit trail for a case
          route.ts              # GET/PATCH single case
        batch/route.ts          # POST batch case creation
        route.ts                # GET/POST cases
      clients/
        [id]/route.ts           # GET/PATCH single client
        route.ts                # GET/POST clients
      compliance/
        audit-stats/route.ts    # GET audit statistics
      external/
        submit/route.ts         # POST external case submission
      fact-check/route.ts       # POST fact-check a brief
      generate-brief/route.ts   # POST generate AI brief
      health/route.ts           # GET health check
      reviewers/
        [id]/route.ts           # GET/PATCH single reviewer
        route.ts                # GET/POST reviewers
      webhooks/route.ts         # POST webhook receiver
    analytics/page.tsx          # Analytics dashboard
    batch/page.tsx              # Batch upload page
    cases/
      [id]/
        brief/page.tsx          # Printable clinical brief
        page.tsx                # Case detail + determination
      new/page.tsx              # New case intake form
      page.tsx                  # Case list
    clients/page.tsx            # Client management
    compliance/page.tsx         # Compliance dashboard
    error.tsx                   # Error boundary page
    global-error.tsx            # Global error boundary
    globals.css                 # Tailwind v4 theme + animations
    layout.tsx                  # Root layout with nav + footer
    login/page.tsx              # Login page (magic link)
    not-found.tsx               # 404 page
    page.tsx                    # Landing page + dashboard
    portal/page.tsx             # Client-facing case tracker
    reviewers/page.tsx          # Reviewer management
    signup/page.tsx             # Signup page
    upload/page.tsx             # 4-step case upload wizard
  components/
    AuditTimeline.tsx           # Audit log timeline display
    AuthProvider.tsx            # Supabase auth context provider
    CaseBrief.tsx               # AI brief display component
    CaseForm.tsx                # Case intake form
    CaseTable.tsx               # Case list table with filters
    DeterminationForm.tsx       # Physician determination form
    FactCheckBadge.tsx          # Fact-check score badge
    HeaderAuth.tsx              # Header auth status/actions
    MobileNav.tsx               # Mobile navigation drawer
    ReviewerPanel.tsx           # Reviewer panel component
    SlaTracker.tsx              # SLA deadline tracker
    StatusBadge.tsx             # Case status badge
  lib/
    audit.ts                    # Audit logging helpers
    auth-guard.ts               # requireAuth() / requireRole()
    claude.ts                   # Anthropic SDK integration
    data-retention.ts           # Data retention policy helpers
    demo-data.ts                # Demo dataset (6 cases, 3 reviewers, 3 clients)
    demo-mode.ts                # Demo mode detection + utilities
    fact-checker.ts             # Deterministic fact-checking engine
    generate-brief.ts           # AI brief generation pipeline
    known-guidelines.ts         # 24 recognized clinical guideline sources
    medical-criteria.ts         # CPT/HCPCS criteria library (50 codes)
    notifications.ts            # SMS stub (Twilio)
    rate-limit-middleware.ts    # Rate limiting middleware
    security.ts                 # PHI sanitization, rate limiter, request context
    sla-calculator.ts           # SLA deadline + urgency calculator
    supabase-browser.ts         # Supabase client (browser)
    supabase-server.ts          # Supabase client (server/SSR)
    supabase.ts                 # Lazy Supabase client via Proxy pattern
    types.ts                    # TypeScript type definitions
    webhook-verify.ts           # HMAC-SHA256 webhook verification
  supabase/
    migrations/
      000_initial_schema.sql    # Baseline schema (tables, indexes, triggers)
      001_auth_rls.sql          # Auth + role-based RLS policies
    schema.sql                  # Full schema (run for fresh setup)
  instrumentation.ts            # Sentry server instrumentation
  middleware.ts                 # Next.js middleware (auth + session refresh)
  next.config.ts                # Next.js config + Sentry + security headers
  sentry.client.config.ts       # Sentry client-side config
  sentry.edge.config.ts         # Sentry edge runtime config
  sentry.server.config.ts       # Sentry server-side config
  vercel.json                   # Vercel deployment config
  vitest.config.ts              # Vitest test runner config
  vitest.setup.ts               # Test setup (Testing Library matchers)
```

---

## Environment Variables

| Variable | Required | Used In | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes* | Client + Server | Supabase project URL. Omit to enable demo mode. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes* | Client + Server | Supabase anonymous/public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes* | Server only | Supabase service role key (bypasses RLS) |
| `ANTHROPIC_API_KEY` | Yes* | Server only | Anthropic API key for Claude brief generation |
| `VANTAHG_API_KEY` | No | Server only | API key for `/api/external/submit` endpoint |
| `WEBHOOK_SECRET` | No | Server only | Shared secret for HMAC webhook signature verification |
| `SENTRY_DSN` | No | Client + Server | Sentry Data Source Name for error reporting |
| `SENTRY_ORG` | No | CI only | Sentry organization slug for source map upload |
| `SENTRY_PROJECT` | No | CI only | Sentry project slug for source map upload |
| `SENTRY_AUTH_TOKEN` | No | CI only | Sentry auth token for source map upload |

*Not required when running in demo mode.

---

## Contributing

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Ensure all checks pass: `npm run lint && npx tsc --noEmit && npm run test:ci`
5. Submit a pull request targeting `main`

All pull requests must pass the CI pipeline (lint, typecheck, test, build) before merging.

---

## License

Copyright 2025-2026 Wells Onyx LLC. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, modification, or use of this software, via any medium, is strictly prohibited without the express written permission of Wells Onyx LLC.

---

Built by [Wells Onyx](https://github.com/WellsOnyx) | Powered by Anthropic Claude

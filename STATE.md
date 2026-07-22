# VantaUM — Build State

**This is the single source of truth for "where the build is right now."**
Future Claude/Cole/Jonah sessions: read this first.

---

## 📌 KEY INSIGHTS — 2026-06-25 (Internal Tool + Cross-Stream Velocity)

**Insight 1: The Brief Engine is for ourselves (internal tooling).**

We are a service company using a platform, not primarily a software company selling a platform to clients.

- Clients only interact at the edges: marketing site + data stream connectors (eFax, portal, Gravity Rail, batch, API, etc.).
- They never log into the engine.
- **Our own team** (arbiters, clinicians/MDs, CX/concierge, admins, etc.) are the users and operators of the full platform.
- This is a monumental simplification:
  - No need for heavy multi-tenant client UX, client admin portals, per-seat billing, etc.
  - Build the engine to make *our people* superhuman.
  - Sell the *outcome* (high-quality, fast, defensible determinations) not the tool.
  - Fits the "humans made superhuman" thesis perfectly — the engine is force-multiplier for credentialed operators; the people are the product.

**Insight 2: Cross-stream velocity + labor arbitrage (the recursive cell economics).**

Current analog: IDR arbiter ~25 cases/day.

Target with engine (95% automation on clerical/brief/criteria/draft/audit): **25 cases/hour** (design target).

One trained person (with proper credentials) can then run multiple streams at that velocity:
- IDR (NSA factors)
- UM (medical criteria)
- Medical Review (clinical judgment)
- IRO/IRE

One high-skill operator can credibly handle the work of 2, 3, or (ambitiously) 4 streams.

Comp model opportunity:
- Pay them at 1/2 (or competitive but not 4x) their "traditional" salary equivalent.
- They can earn toward 2-4x output/income depending on ambition and credential coverage.
- Drastically lower labor cost per case for the company.
- Life-changing upside for the people who stay and master the tool.

**Stress-test / bounds (important — do not treat targets as measured doctrine):**
- 25/hr and "work of 4" are design targets, not yet proven throughput.
- The agnostic 95% (intake, brief, fact-check, draft, routing, SLA, basic audit, template population) transfers cleanly across streams.
- The judgment 5% is still gated by credentials and expertise:
  - Attorney/arbiter for IDR weight-of-evidence (NSA factors, QPA, additional circumstances).
  - Clinician/MD for UM/medical necessity and Medical Review.
  - Cannot freely swap without the right license/qualification.
- Actual multiple (10x? 20x? 25x?) and sustainable quality will be measured once the engine runs real cases across streams.
- Build the comp promise and pricing on the *measured* velocity, not the aspirational target (same discipline as conservative clear-rate pricing).

**Synthesis for the model:**
The engine turns one credentialed operator into a multi-stream force multiplier. 
- Labor cost collapse at company level.
- Income explosion (with ceiling) for operators.
- Bounded by real credentials on the human judgment step.
- Sized on what the engine actually delivers in production, not the slide.

Banked. This is now core to how we think about the platform, staffing, and economics.

(The specific internal compensation bands are managed outside this repo and not published here.)

---

## 📱 MOBILE HANDOFF — 2026-05-13 (4:09 PM ET)

## 📱 MOBILE HANDOFF — 2026-05-13 (4:09 PM ET)

Jonah is heading out. Fresh thread on the phone Claude app should pick up here.

**What just shipped in this push:**

1. **Demo-mode admin auth bypass closed.** [lib/auth-guard.ts](lib/auth-guard.ts) used to auto-mint a mock admin user whenever `isDemoMode()` was true. Production was in demo mode (empty Supabase secrets), so anyone hitting `/admin/*` got admin access. Fix: `if (isDemoMode() && NODE_ENV === 'production') return 401`. Local dev / test still get the mock admin. Three new tests in `__tests__/lib/auth-guard.test.ts` lock this in. **215/215 tests passing.**

2. **RDS migrations 019 + 020 applied.** RDS was stuck at migration 018 — `practices`, `practice_users`, all `meow_*` columns didn't exist. Both applied cleanly via bastion. RDS-specific variants live at `infra-aws/rds-migrations/019_practices.sql` (auth.users FKs stripped, RLS simplified to get_user_role-only) and `infra-aws/rds-migrations/020_meow_billing.sql` (identical to Supabase version).

**What's still broken on prod (NOT fixed in this push, intentionally deferred):**

- **Fargate container is stale.** Running image `vantaum-prod-app:v2`, pushed 2026-05-12 22:32 EDT — predates portals, Meow integration, auto-assign hook, and migrations 019/020. `/portal/tpa` and `/portal/provider` both 404 in prod. The code is on main; the image doesn't have it.
- **App is in demo mode on prod.** `/api/health` returns `database: "demo_mode"`. Three reasons stacked:
  - Supabase keys are empty strings in `vantaum-prod-third-party-keys`
  - `ENABLE_AWS_DB` is not set in `infra-aws/lib/compute-stack.ts` (it's not even wired)
  - So `getServiceClient()` → empty URL → `hasSupabaseConfig()=false` → demo mode
- **SES has zero verified identities.** Magic-link / signature emails would fail to send even if everything else worked.
- **HelloSign keys empty** in the secrets vault. `send-for-signature` returns stub envelopes.
- **Meow runtime bootstrap paused** waiting on Jonah to provision the dedicated "VantaUM" Meow account. See the ACTIVE TASKS section at the bottom.

**Honest production readiness: ~20%.** Migrations + auth bypass closed move the needle from 15% but the running container is still the old one and the DB env vars aren't wired. To get to "real customer can complete signup → portal" you still need:

1. Build new container image from current main, push to ECR, force ECS redeploy (~30–45 min)
2. Either fill Supabase keys OR add `ENABLE_AWS_DB=true` + RDS URL to compute-stack (~15 min)
3. Verify SES domain (`vantaum.com`) for email (async, ~10 min config + 24–48h AWS ticket for prod access)
4. Fill HelloSign keys when ready to send real e-sign requests
5. Resume Meow bootstrap once Jonah's new Meow account exists

**Branch state:** This commit is on `claude/upbeat-wu-eef6c1`. Will be pushed to `origin` after this edit. Jonah will merge to main via PR or fast-forward later.

**What NOT to do on the phone:**
- Don't kick off a `docker build` / ECR push from a phone session — too long, too easy to corrupt
- Don't apply any more RDS migrations until you've confirmed on a desktop session that 019/020 are reflected
- Don't try to fix SES or HelloSign without Jonah on the line (verification emails, key rotation)

**Safe phone-thread tasks if Jonah asks:**
- Review the audit findings, propose ordering for the remaining gaps
- Read STATE.md sections + answer questions about the architecture
- Plan the next container build (write the Dockerfile diff, etc. — just don't execute it)
- Update memory files or STATE.md notes

---

## 📎 Phone-session docs added 2026-05-13

Six planning/runbook docs added under `docs/` from a phone-session
review of the MOBILE HANDOFF state. All documentation, no code or
infra changes. Live on branch `claude/review-mobile-handoff-state-VNw1N`
(draft PR #25 — not yet merged).

- `docs/container-rebuild-2026-05-13.md` — runbook to build + push v3
  image to ECR + cycle Fargate off the stale v2. Includes rollback.
- `docs/db-wiring-decision.md` — Option A (ENABLE_AWS_DB → RDS shim)
  vs Option B (fill Supabase keys). Recommends A. CDK diff included.
- `docs/demo-mode-audit.md` — 12 `isDemoMode()` branches across 9
  admin routes catalogued. All HIGH-risk branches are now dead in
  prod (`e1615ed` 401s before them); flagged as dev-only.
- `docs/ses-verification-runbook.md` — end-to-end SES domain
  verification for `vantaum.com` + production-access ticket template.
- `docs/meow-bootstrap-resume.md` — clean checklist version of the
  buried Meow bootstrap section below. Resume path for when Jonah
  provisions the new VantaUM Meow account.
- `docs/pr-e1615ed.md` — retrospective PR description for the
  auth-guard fix + RDS migrations 019/020 commit.

A future thread should treat these as the source of truth for HOW to
execute each blocker. STATE.md remains the source of truth for WHERE
the build stands.

---

## 🛠️ Phone-session feature work 2026-05-13 (evening)

Same branch (`claude/review-mobile-handoff-state-VNw1N`, draft PR #25)
now also carries pure-code feature commits beyond the docs. None of
these are live in prod yet — they ship with the v3 container rebuild
described in `docs/container-rebuild-2026-05-13.md`. All commits
pushed to origin.

**Infra wiring (compute-stack.ts, will activate on `cdk deploy
vantaum-prod-compute`):**
- `5614aff` — `ENABLE_AWS_DB=true` env var added so the Fargate task
  routes DB calls through the pg shim (`lib/db/supabase-shim.ts`)
  against RDS. Auth still hybrid-Supabase per V1 plan.
- `2376e38` — Meow billing env vars wired (`MEOW_API_KEY`,
  `MEOW_ENTITY_ID`, `MEOW_COLLECTION_ACCOUNT_ID`,
  `MEOW_VANTAUM_PRODUCT_ID`, plus `ENABLE_REAL_MEOW=true`). Slots
  empty until Jonah finishes provisioning the dedicated VantaUM Meow
  account per `docs/meow-bootstrap-resume.md`.

**Admin demo-mode signal:**
- `f5c8330` — `X-Demo-Mode: true` response header on the 12 admin
  demo-mode short-circuits. Dev-tools clarity; the branches
  themselves are now unreachable in prod after `e1615ed`.

**CSR triage UI completion (the chunky track from this session):**
- `0de4903` — security: closed an auth bypass on
  `/api/intake/efax/queue`. The middleware's `/api/intake/efax`
  prefix match inadvertently whitelisted the CSR triage API as
  public. Split `PUBLIC_ROUTES` into `PUBLIC_PAGE_PREFIXES`
  (loose, for marketing pages) + `PUBLIC_EXACT` + `PUBLIC_API_PREFIXES`
  (slash-bounded, for Phaxio webhook subpaths only). Added
  `requireRole(INTERNAL_STAFF_ROLES)` to GET and PATCH. Same class
  of bug as the admin auth bypass `e1615ed` patched.
- `4059999` — feature: source-fax PDF preview in the triage detail
  panel. New endpoint `GET /api/intake/efax/queue/[id]/document`
  mints a 5-minute signed URL via `supabase.storage.createSignedUrl`
  against the existing `efax-documents` bucket. UI adds a load-on-
  demand "Source Fax" card with embedded iframe + "open in new tab"
  link. Audit-logs the PHI access.
- `004097a` — feature: raw OCR text panel (collapsible `<details>`
  in the right-side diagnostic column) + idempotent promote. The
  promote PATCH now short-circuits with `{ already_promoted: true }`
  when `row.case_id` is already set, preventing double-create on
  double-click. Demo rows carry realistic OCR snippets so the UI
  surfaces the new card with content.
- `3d0edea` — test: 13 Vitest cases covering the queue route. Auth
  gate (401 in prod demo / 200 in dev demo / 401 PATCH), demo shape
  (items include `ocr_text`, filter works, has dead_letter rows),
  each of the four PATCH verbs, and the document endpoint. Could
  not run vitest in this phone harness — desktop session should
  `npm run test:ci` before merging.

**Triage tab is the "CSR triage UI" item that used to live in
CLAUDE.md's "What's next" list** — moved to "What's built" in this
session along with this STATE.md update.

What's still required to actually run the new code in prod:
1. Container rebuild + push v3 to ECR (per
   `docs/container-rebuild-2026-05-13.md`)
2. Force-new-deployment on Fargate
3. Once running: hit `/intake` as a logged-in concierge or admin,
   confirm the triage tab renders, source-fax preview loads a signed
   URL, OCR card shows raw text, promote creates a case row in RDS.

**Determination letter email delivery (added later in the same session):**
- `71e5cb0` — feat: EmailAdapter interface now supports
  `attachments: EmailAttachment[]`. SMTP impl forwards them to
  nodemailer.sendMail. Backwards compatible. SES stub is unchanged
  (note in the file points future-Cole at SendRawEmailCommand for
  binary attachments via SDK).
- `b1ac78f` — feat: `lib/notifications/determination-delivery.ts`
  ships `deliverDeterminationLetter(caseId, { actor, recipientOverride })`.
  Renders the existing determination PDF via
  `generateDeterminationPdf`, sends via the adapter with the PDF
  attached, updates `cases.status` to `delivered`, audit-logs the
  message id and a redacted recipient. Idempotent via the
  `delivered` status — no migration required.
- `48dd671` — feat: `POST /api/cases/[id]/send-determination-email`
  endpoint (requireRole INTERNAL_STAFF_ROLES) + "Send to TPA"
  button on the determination letter page. UI shows a "Delivered"
  pill once the send succeeds and the action label flips to
  "Re-send to TPA" (handler is idempotent so re-sends are safe).
- `26fd5b9` — test: 12 Vitest cases — SMTP attachment passthrough
  (3), `deliverDeterminationLetter` preconditions + happy path (7),
  endpoint auth gate + demo response (3).

What it takes to actually send a real letter in prod:
1. SES domain verification per `docs/ses-verification-runbook.md`.
2. `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` filled in the third-party
   vault (or `ENABLE_AWS_EMAIL=true` once Cole implements
   SesEmailAdapter via SendRawEmailCommand).
3. v3 container rebuild + Fargate force-new-deployment.

**Portal integration tests (closes the gap flagged after Plan A Steps 3-7):**
- `5862c7a` — test: 11 Vitest cases covering the three portal-facing
  endpoints. tpa-me + provider-me each get demo-shape / unauth-401 /
  missing-tenant-403 coverage. The big one is the
  cross-tenant invite test: a tpa-A admin trying to invite a user
  into a tpa-B practice returns 403 AND the
  `security:cross_tenant_practice_invite_blocked` audit event must
  fire. If the `practice.client_id === inviter.tpa.id` check ever
  regresses, that test is the alarm.

**Auto-book weekly kickoff calendar invite (backlog item from spec):**
- `107c7ca` — feat: `lib/calendar/ical-generator.ts` minimal RFC 5545
  builder. METHOD:REQUEST so Outlook / Gmail render Accept / Decline,
  weekly RRULE, UTC times, TEXT-field escaping, 75-octet line folding,
  CRLF compliance. No new dep. Plus `nextWeekdayOccurrenceUtc` helper
  for "next future instance" math. 12 Vitest cases.
- `90c8ac6` — feat: `lib/notifications/kickoff-invite.ts:sendKickoffInvite`
  emails the .ics as a text/calendar attachment via the email adapter
  on onboarding completion. Hooked into POST /api/onboarding via
  fire-and-forget after `body.complete` flips status to 'completed'
  (a failed invite must not block the onboarding response). Idempotent
  via `onboarding_data.kickoff.invite_sent_at` — JSONB column, no
  migration required. 7 Vitest cases covering demo, signup_not_found,
  no_kickoff / no_recipient skips, already_sent idempotency, happy
  path with attachment validation, and send_failed.

What it takes to deliver real kickoff invites in prod:
1. SES domain verification per `docs/ses-verification-runbook.md`.
2. SMTP env vars filled in the third-party vault (same as
   determination delivery — same email adapter).
3. v3 container rebuild + Fargate force-new-deployment.

**Real PDF upload on case submission (backlog item from STATE.md tail):**
- `56759cc` — feat: `POST /api/cases/[id]/documents` multipart upload
  endpoint. Auth-gated via requireAuth + assertCaseAccess (TPA can
  only upload to cases their tenant owns). Per-file validation:
  PDF-only, 10 MB cap, 5-file cap per request. Returns
  `{ accepted: [...], rejected: [...] }` so partial-success is the
  normal shape, not an error. Stores via the existing storage
  adapter to `efax-documents` bucket at
  `cases/<caseId>/<UTC-yyyymmddThhmmss>-<safe-filename>`. Note:
  reuses `efax-documents` bucket instead of provisioning a new
  `case-documents` logical bucket — semantically slightly off but
  avoids an infra change. Audit-logs `case_documents_uploaded`
  with counts + bytes_total (never the filenames, which may include
  PHI).
- `07c0afb` — feat: CaseUploadForm now accepts up to 5 PDFs per
  submission via a two-phase submit (Phase 1: JSON POST to /api/cases
  creates the case; Phase 2: multipart POST to the documents endpoint
  with the selected files). A failed Phase 2 does NOT roll back the
  case — the user can re-attach from the case detail page. UI shows
  per-file MB counts, transitions the submit button copy through
  Submitting → Uploading N file(s), and surfaces accepted/rejected
  counts inline with per-rejection reason + detail.
- `71ee3e6` — test: 6 Vitest cases. Auth gate (prod 401 / dev 200 +
  X-Demo-Mode), empty / oversized request 400s, non-PDF rejection
  shape (storage adapter never called), happy path with adapter
  bytes + bucket + path-prefix assertions + submitted_documents
  append.

What still needs desktop work to fully ship this:
1. v3 container rebuild + Fargate force-new-deployment.

**Quality audit endpoint test coverage + "New audit" entry point:**
- `070073a` — test: 12 Vitest cases for the `/api/quality/*` surface
  that had zero coverage before. GET /audits (3 — auth gate, demo
  list, filter param passthrough), POST /audits (3 — auth gate,
  400 on missing case_id, 201 happy path), GET /audits/[id] (2 —
  auth gate, dev-demo 404), PATCH /audits/[id] (2 — auth gate,
  success), GET /metrics (2 — auth gate, response shape match).
- `08743dc` — feat: "+ New audit" button + modal on /quality.
  Three inputs: Case ID (free text UUID), Auditor (dropdown of
  staff filtered to RN), Staff audited (dropdown of staff filtered
  to LPN). Submit POSTs to /api/quality/audits, closes modal,
  switches to "Audit History" tab, re-fetches audits so the new
  row shows up immediately.
- `371d71e` — feat: /quality/[id] scoring page. Auditing RN gets
  a form with the four scoring fields (two 0..100 sliders for
  criteria_accuracy / documentation_quality, two Yes/No toggles
  for sla_compliance / determination_appropriate) plus a notes
  textarea. Live "Overall N%" pill in the header mirrors the
  server-side avg computation. PATCHes /api/quality/audits/[id]
  and redirects back to /quality on success. Re-edits supported
  for completed audits (form seeds from stored values, button
  label flips to "Save changes"). The audit history rows in
  /quality are now clickable to navigate here. URAC's full
  create → score → review-in-list loop is now UI-reachable.

**SLA-aware LPN selection in pod assignment:**
- `18a52dd` — feat: new `lib/delivery/lpn-scoring.ts` module.
  Replaces the legacy `(activeCount asc, avg_turnaround_hours asc)`
  sort with a score that maximizes slack vs the case deadline,
  lightly penalized by load as a tiebreaker.
    expected_completion = (activeCount + 1) * avg_turnaround
    slack_hours          = time_to_deadline - expected_completion
    score                = slack_hours - LOAD_PENALTY_WEIGHT * activeCount
  When the case has no turnaround_deadline (rare — pre-SLA cases),
  falls back to the legacy ordering so no behavior regresses. The
  `pod_assigned` audit event now carries sla_score, sla_slack_hours,
  and expected_completion_hours so ops can investigate missed
  SLAs by reading the trail. Tunable knob: LOAD_PENALTY_WEIGHT
  (default 0.1). Bump toward 1.0 to favor load balancing; toward
  0.0 to favor pure SLA fit.
- `2b07594` — test: 12 Vitest cases on the pure scorer (no DB, no
  clock). Math assertions cover slack / score / fallback / null
  avg_turnaround. Selection scenarios cover the key cases: SLA
  pressure wins over load on tight deadlines (the whole point),
  load tiebreaker wins on comfortable deadlines, least-bad LPN
  picked when no one can hit the deadline, stable tiebreaker on
  equal scores.

Real-world tuning of LOAD_PENALTY_WEIGHT will happen once
production assignment data exists. The synthetic-test suite is
the contract until then.

**Submitted-documents download view (closes the loop from real-PDF upload):**
- `afdb476` — feat: `GET /api/cases/[id]/documents/sign?path=<...>`
  mints a 5-min signed URL via the storage adapter (same
  `efax-documents` bucket as the uploader). Two-stage path guard:
  the path must start with `cases/<caseId>/` (no traversal, no
  cross-case access by prefix) AND must appear in
  `submitted_documents[]` for the row (membership check — a TPA
  who guesses the upload-time path pattern still gets a 404).
  Both bad-path branches return identical 404s so the response
  never leaks whether a file exists elsewhere; both fire a
  `security:document_sign_*` audit event so investigations have
  a trail. Happy path audit-logs `case_document_viewed`.
- The case detail page Documents card is now click-to-download:
  each entry renders as a button that fetches a fresh signed URL
  and opens it in a new tab. Filenames display stripped of the
  upload-timestamp prefix (`clin-notes.pdf` instead of the raw
  `20260513T140000-clin-notes.pdf`). Loading / error states render
  inline; the full storage path remains in the button's title
  attribute for debugging.
- `9a2a361` — test: 7 Vitest cases. Path-validation branches are
  the highest-stakes assertions in the suite — they're the line
  between "TPA reviews their own upload" and "TPA peeks at a
  sibling case's upload" within their own tenant. Tests cover
  401 prod demo, dev demo no-op shape, missing `path` 400,
  cross-case prefix 404, `..` traversal 404, well-shaped path
  not-in-membership 404, and the happy-path signed-URL +
  audit-log assertions.

---

> ## 🆕 Resuming as a fresh Claude thread? Do this:
>
> ```bash
> cd ~/vantahg-brief-engine
> git pull origin main
> # 1. Read this whole file - scroll to "ACTIVE TASKS RIGHT NOW" at the bottom for the immediate context
> # 2. Check the locked decisions section so you don't relitigate Stripe-vs-Meow, AWS-vs-Vercel, etc.
> # 3. git log --oneline -20 to see what just shipped
> # 4. Ask Jonah: "I read STATE.md - last in-flight task was X. Resume?"
> ```
>
> **Locked decisions live in `~/.claude/projects/-Users-jonahmanning-vantahg-brief-engine/memory/`** and auto-load every session. Don't waste turns rediscussing:
> - Billing: Meow (not Stripe)
> - Hosting: marketing on Vercel, app on AWS Fargate
> - Auth V1: hybrid Supabase Auth, Cognito later
> - Florida governance + Jonathan Arias signs all contracts
> - Customer portals: separate TPA + Provider, shared form component
> - Practice provisioning: self-serve invite from TPA admin (V1)
>
> **Don't:** propose Stripe, propose a rewrite, "build a portal demo," or take pragmatic-shortcut casts when not asked. Jonah's spent real time getting here.

Last update: 2026-05-13 (post-AWS-migration session)

---

## TL;DR

The full VantaUM app is **deployed and running on AWS Fargate** behind a load balancer. Vercel is still serving production traffic at `vantaum.com`. AWS is ready to take over.

- **Marketing site:** Vercel (`vantaum.com`) — stays on Vercel forever
- **App:** Live on AWS Fargate at `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com` — needs DNS cutover to `app.vantaum.com` to be customer-facing
- **AWS BAA active** in AWS Artifact. Account is HIPAA-eligible.
- **6 CloudFormation stacks deployed**, 24 tables in RDS, 4 S3 buckets KMS-encrypted, Cognito user pool ready, SES configuration set ready, EventBridge cron firing every minute
- **195 tests passing**

---

## The Wireframe — How the System Is Built

```
                      ┌────────────────────────────┐
                      │   Marketing Site (Vercel)  │
                      │   vantaum.com              │
                      │   No PHI, no BAA needed    │
                      └─────────────┬──────────────┘
                                    │
                  "Sign In" / "Request Early Access"
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  AWS Account 309921834034 / us-east-1                │
│                       (BAA active in Artifact)                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   Public:  ALB at vantaum-prod-alb-*.elb.amazonaws.com       │   │
│  │           ↓ (HTTPS once ACM cert is added; HTTP today)       │   │
│  │   ┌─────────────────────────────────────────┐                │   │
│  │   │  Fargate Task                           │                │   │
│  │   │  - Next.js 16 standalone in container   │                │   │
│  │   │  - ECR: vantaum-prod-app:v2 (358MB)     │                │   │
│  │   │  - 1024 vCPU / 2048 MiB / ARM64         │                │   │
│  │   │  - Env vars sourced from Secrets        │                │   │
│  │   │    Manager (vantaum-prod-third-party-   │                │   │
│  │   │    keys + vantaum-prod-db-admin-creds)  │                │   │
│  │   └────────┬──────────────┬──────────┬─────┘                │   │
│  │            │              │          │                       │   │
│  │            ▼              ▼          ▼                       │   │
│  │    ┌───────────┐  ┌───────────┐ ┌───────────┐                │   │
│  │    │   RDS     │  │   S3      │ │   SES     │                │   │
│  │    │ Postgres  │  │ 3 buckets │ │ Conf set  │                │   │
│  │    │ 24 tables │  │ KMS-enc.  │ │ + SNS DLQ │                │   │
│  │    └───────────┘  └───────────┘ └───────────┘                │   │
│  │                                                              │   │
│  │    ┌───────────┐  ┌───────────┐ ┌────────────────────────┐  │   │
│  │    │ Cognito   │  │ Bastion   │ │ EventBridge            │  │   │
│  │    │ User Pool │  │ EC2 (SSM) │ │ rate(1 min) → Lambda → │  │   │
│  │    │ + 3 magic │  │ for psql  │ │ ALB /api/cron/efax     │  │   │
│  │    │ link Lams │  │ ad-hoc    │ │                        │  │   │
│  │    └───────────┘  └───────────┘ └────────────────────────┘  │   │
│  │       (ready, not                                            │   │
│  │       yet cutover)                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                    │
        Auth in V1: app talks to Supabase Auth (hybrid mode)
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │  Supabase Auth          │
                       │  Issues session cookies │
                       │  Will be replaced by    │
                       │  Cognito in a later wave│
                       └─────────────────────────┘
```

---

## What Each Piece Is For

### Application code (lives in `/`)
- `app/` — Next.js 16 App Router. Marketing pages + app pages + API routes.
- `lib/` — shared business logic. Brief generation, fact checker, SLA calc, intake pipeline, contract generator, billing.
- `supabase/migrations/` — SQL schema. **Source of truth for tables.** Applied to both Supabase and RDS.
- `__tests__/` — Vitest. 195 tests.

### AWS infrastructure (lives in `infra-aws/`)
- CDK app with six stacks:
  - `vantaum-prod-storage` — S3 + KMS
  - `vantaum-prod-database` — VPC + RDS + Secrets Manager
  - `vantaum-prod-email` — SES config set + suppressions table
  - `vantaum-prod-auth` — Cognito user pool + magic-link Lambdas + OTP table
  - `vantaum-prod-compute` — ECR + Fargate + ALB + bastion + secrets vault
  - `vantaum-prod-cron` — EventBridge + invocation Lambda

### Vendor abstraction (the "swap layer")
- `lib/db/types.ts` — `DbClient` interface = the slice of Supabase the app actually uses.
- `lib/db/supabase-shim.ts` — pg-backed implementation of that interface. Compiles `supabase.from('cases').select().eq(...)` into parameterized SQL.
- `lib/db/pool.ts` — singleton pg pool. Reads connection from `DATABASE_URL` or `DB_HOST`/etc.
- `lib/supabase.ts` — factory that returns either real Supabase or the shim, based on `ENABLE_AWS_DB` env flag.
- `lib/adapters/storage/` — same pattern for files. `S3StorageAdapter` is the real implementation.
- `lib/adapters/auth/` — same pattern for auth. Cognito impl is stubbed; Supabase impl is live.

### Container build
- `Dockerfile` (repo root) — three-stage build → 358MB image
- `next.config.ts` has `output: 'standalone'` + `outputFileTracingRoot` for worktree safety

---

## Where We Are Right Now

### What's working
- Vercel deploy serving production traffic at `vantaum.com`
- AWS Fargate task running, ALB returning 200 on `/api/health`
- RDS has 24 tables, schema matches Supabase
- S3 buckets exist and are encrypted with customer-managed KMS keys
- All six CloudFormation stacks deployed cleanly
- Cognito user pool + magic-link Lambdas deployed (not yet cutover)
- SES configuration set + bounce handling deployed (domain not yet verified)
- EventBridge cron schedule firing every minute (Lambda 404s until app is real-mode)
- Shim validated against real RDS (14/14 end-to-end tests pass)
- 195 unit tests passing

### What's not yet done
1. **AWS app talks to empty database.** Third-party secrets vault (`vantaum-prod-third-party-keys`) has empty string defaults. The Fargate task boots in demo mode because `NEXT_PUBLIC_SUPABASE_URL` is `""`.
2. **No HTTPS on the ALB.** Listener is port 80 only. ACM cert + HTTPS listener needs to be added.
3. **No DNS for `app.vantaum.com`.** The ALB is reachable only via its AWS-generated hostname.
4. **No data migration from Supabase to RDS.** RDS is structurally identical but empty. Existing Supabase users + cases haven't been backfilled.
5. **SES domain not verified.** Cannot send email from `noreply@vantaum.com` until DKIM is set up + SES is out of sandbox.
6. **Cognito Auth not cutover.** Magic-link Lambdas are deployed but the app still uses Supabase Auth for sessions.

### Hybrid V1 mode (what you ship to first customers)
- App on AWS Fargate (compute + RDS + S3 + KMS — HIPAA-eligible under AWS BAA)
- Auth on Supabase Auth (existing flow, low risk, no user migration needed)
- Marketing on Vercel

Cognito + data backfill happen in a later wave when there's appetite for the user migration.

---

## The Path to "First Real TPA Onboarded"

In strict order:

### Step 1 — Fill the third-party secrets vault (~5 min, you do it)
AWS Console → Secrets Manager → `vantaum-prod-third-party-keys` → Edit. Fill in the 13 empty strings with real values from your Vercel env (or generate fresh, like `cron_secret`). Map is in `docs/aws-cutover-state.md`.

### Step 2 — Force a Fargate redeploy (~2 min)
```bash
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```

### Step 3 — Verify
```bash
curl http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health
```
Expected: `"database":"connected"`. If "demo_mode", a Supabase env value is still wrong.

### Step 4 — ACM + HTTPS (~30 min)
1. AWS Console → ACM → Request → `app.vantaum.com` → DNS validation
2. Add the CNAME record to vantaum.com's DNS (Vercel DNS or wherever)
3. Wait for cert (5-30 min)
4. EC2 → Load Balancers → vantaum-prod-alb → Add HTTPS listener → forward to existing target group with the new cert
5. Edit port 80 listener → redirect to HTTPS

### Step 5 — DNS for app.vantaum.com (~5 min)
Add CNAME: `app.vantaum.com` → `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com`

### Step 6 — SES domain verification (~10 min config, 24-48h AWS support ticket)
1. AWS Console → SES → Verified identities → Create → Domain → vantaum.com → Easy DKIM
2. Add the DKIM CNAME records to DNS
3. Wait for verification (~10 min)
4. File support ticket: "request SES production access for vantaum.com"

### Step 7 — Real signup walk-through (~30 min)
With the new URL live:
1. Open `https://app.vantaum.com/signup-tpa` in a private window
2. Fill out the form with a real test email
3. Approve at `/admin/signups`
4. Generate MSA
5. Send for signature
6. Sign as TPA in Dropbox Sign email
7. Counter-sign as Jonathan Arias
8. Receive magic link, click, land in `/client/cases`
9. Walk through onboarding wizard

If any step fails, you have a real bug to fix — but the foundation is real and the data is in RDS + S3.

### Step 8 — Decommission Vercel app routes (when you're ready)
Marketing stays. Everything authenticated moves to `app.vantaum.com`. Update the Sign In button on the marketing site if it doesn't already point at the AWS URL.

---

## Key Files (for future-thread orientation)

| Path | What it does |
|---|---|
| `STATE.md` | (this file) Source of truth for build state |
| `README.md` | Product description (mostly for prospects/onlookers) |
| `CLAUDE.md` | Project conventions, tech stack, command reference |
| `docs/aws-migration.md` | Detailed migration playbook |
| `docs/aws-migration-status.md` | First-pass migration status (older but still accurate) |
| `docs/aws-cutover-state.md` | Detailed steps for the cutover process |
| `infra-aws/README.md` | CDK app overview |
| `infra-aws/rds-migrations/README.md` | RDS-specific migration files (where they differ from Supabase) |
| `supabase/migrations/*.sql` | Schema migrations (000-018) |
| `lib/db/supabase-shim.ts` | The shim — read this if you wonder how 197 supabase queries map to pg |
| `lib/adapters/storage/s3.ts` | S3 adapter implementation |
| `__tests__/lib/db/supabase-shim.test.ts` | 18 SQL-generation tests covering shim behaviors |
| `scripts/validate-rds-shim.mjs` | End-to-end script that runs SQL patterns against real RDS via bastion |

---

## What the AWS Stack Costs

| Resource | Monthly cost (idle / running) |
|---|---|
| RDS t4g.micro single-AZ | $15 |
| Fargate 1 task (1024/2048) | $30 |
| ALB | $18 |
| NAT Gateway (1) | $32 |
| Bastion t4g.nano | $3 |
| S3 + KMS | < $5 |
| Cognito (< 50k MAU) | $0 |
| SES | $1/10k emails |
| EventBridge + Lambda | < $1 |
| Secrets Manager (4 secrets) | $1.60 |
| CloudWatch logs | < $5 |
| **Total** | **~$105/month running** |

This is rounding error at the revenue you're targeting. Don't over-optimize.

---

## Commands That Save Time

### Deploy a single stack
```bash
cd infra-aws
AWS_PROFILE=vantaum ./node_modules/.bin/cdk deploy vantaum-prod-<stack>
```

### Re-deploy Fargate with a new image
```bash
docker build --platform linux/arm64 -t vantaum-app:vN .
aws ecr get-login-password --profile vantaum --region us-east-1 | docker login --username AWS --password-stdin 309921834034.dkr.ecr.us-east-1.amazonaws.com
docker tag vantaum-app:vN 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:vN
docker tag vantaum-app:vN 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:vN
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest
REAL_IMAGE_TAG=vN AWS_PROFILE=vantaum ./infra-aws/node_modules/.bin/cdk deploy vantaum-prod-compute --require-approval never
```

### Force the running service to pick up new image / new secrets
```bash
aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app --force-new-deployment --profile vantaum --region us-east-1
```

### Run psql against RDS via bastion
```bash
aws ssm send-command \
  --profile vantaum --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids i-0ac7f36a48ac8aacc \
  --parameters 'commands=[
    "SECRET=$(aws secretsmanager get-secret-value --secret-id vantaum-prod-db-admin-credentials --region us-east-1 --query SecretString --output text)",
    "export PGHOST=$(echo \"$SECRET\" | jq -r .host) PGUSER=$(echo \"$SECRET\" | jq -r .username) PGPASSWORD=$(echo \"$SECRET\" | jq -r .password) PGDATABASE=$(echo \"$SECRET\" | jq -r .dbname)",
    "psql -c \"YOUR QUERY HERE\""
  ]'
```

### Tail Fargate logs
```bash
aws logs tail /vantaum/prod/app --profile vantaum --region us-east-1 --follow
```

---

## Identifiers To Remember

| Thing | Value |
|---|---|
| AWS account ID | 309921834034 |
| AWS region | us-east-1 |
| AWS CLI profile | `vantaum` |
| ALB DNS | `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com` |
| Bastion instance | `i-0ac7f36a48ac8aacc` |
| RDS endpoint | `vantaum-prod-database-databaseb269d8bb-iruufzdfjweg.c4vqceyuu67e.us-east-1.rds.amazonaws.com:5432` |
| RDS DB name | `vantaum` |
| RDS admin user | `vantaum_admin` |
| RDS admin secret | `vantaum-prod-db-admin-credentials` in Secrets Manager |
| Third-party secrets | `vantaum-prod-third-party-keys` in Secrets Manager |
| Cron secret | `vantaum-prod-cron-secret` in Secrets Manager |
| ECR repo | `309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app` |
| ECS cluster | `vantaum-prod` |
| ECS service | `vantaum-prod-app` |
| Cognito user pool | `us-east-1_CjZbn5TD4` |
| Cognito client ID | `4v19mdtmaa8ubns3d6bsi4t2i7` |
| SES config set | `vantaum-prod` |
| KMS key alias | `alias/vantaum-prod-storage` |
| VPC | `vpc-0a38b86e176d38283` (10.10.0.0/16) |

---

## What NOT To Do

- **Don't touch the WorkSpaces VPC** (`vpc-09df802a2903275ff`, 172.16.0.0/16). Cole confirmed it's unused but it's tagged from an old experiment. Leave it alone.
- **Don't `cdk destroy` anything.** Retention policies are RETAIN for everything that holds state. Destroy will fail (deliberately).
- **Don't change Cognito custom attributes.** They're immutable; adding a new one requires recreating the entire user pool and losing all users.
- **Don't put PHI in the public bucket.** `vantaum-prod-public-assets` is intended for logos / brand assets that are served via signed URL but aren't PHI. PHI goes in `signup-contracts` or `efax-documents`.
- **Don't bypass the shim.** If you need a query the shim doesn't support, add it to the shim (and add a test) rather than fanning out raw SQL.
- **Don't hardcode credentials.** Everything goes through Secrets Manager.

---

## Open Questions / Decisions Pending

1. **Auth cutover date.** Hybrid Supabase Auth works fine for V1. When do we cut to Cognito? Probably after the first 2-3 customers are stable. Decision: not before.
2. **Multi-AZ on RDS.** Currently single-AZ. Costs +~$60/mo for true HA. Flip when revenue justifies.
3. **Reserved Instances / Savings Plan.** Fargate Savings Plan = ~30% off after a year of usage data. Don't lock in until volume is predictable.
4. **Application of RLS at the app layer.** RDS RLS uses session GUCs set by middleware. Currently no middleware sets these; service-role bypasses RLS via `vantaum_admin`. Fine for V1 with service-role pattern; needs hardening for SOC 2.
5. **Data migration from Supabase to RDS.** RDS is empty. Either pg_dump + restore at cutover, or start fresh on AWS and let Supabase Postgres age out.

---

## When This Doc Gets Out Of Date

If you (Claude in a future session) detect that this doc is wrong:
1. **Trust observed state over this doc.** Run AWS CLI / git log to confirm.
2. **Update this doc.** Future-you depends on it.
3. **Don't generate "next step" docs in `docs/` instead.** Update this one.

---

## ⚠️ HONEST AUDIT (2026-05-13, late session)

**Done a real probe of `https://app.vantaum.com`. Findings are harsher than the docs above claim:**

| Probe | Result | Reality |
|---|---|---|
| GET `/api/health` | 200, `database: "demo_mode"` | App is HEALTHY but in DEMO MODE |
| GET `/` | 200 marketing-ish HTML | Live |
| GET `/signup-tpa` | 200 | Page renders |
| GET `/admin/signups` | 200 (no auth check) | Demo-mode bypasses auth |
| GET `/portal/tpa` | **404** | **Recent code not deployed** |
| POST `/api/signup-tpa` synthetic | 201 `{success:true, demo:true, "no row written"}` | **Real signups silently disappear** |

### What this means
- The Fargate container is running an **older image** that pre-dates the TPA + Provider portals, the auto-assignment feature, and the Meow client. All that code is on `main` but **NOT in the running container**.
- The app is in demo mode because `NEXT_PUBLIC_SUPABASE_URL` is empty in the AWS secrets vault. `hasSupabaseConfig()` returns false, `isDemoMode()` returns true, every API route short-circuits to demo data.
- Demo mode silently swallows POST requests instead of writing rows. **A prospect filling out `/signup-tpa` today would get a "success" message but nothing happens.**
- Admin pages have no auth gate when demo mode is on. Not a security issue right now (no real data) but anyone with the URL sees admin UI.

### To make app.vantaum.com actually production-ready
The deltas, in priority order:

1. **Decide the database backend.** Two options:
   - **Use Supabase from AWS:** add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to the secrets vault. Wire them in ComputeStack. App leaves demo mode. Fast.
   - **Use RDS:** flip `ENABLE_AWS_DB=true` env var on the Fargate task. App routes through the pg shim (already coded). RDS has the schema but zero data — fresh start.
   The honest right answer is **Supabase from AWS for V1** since we're not ready to drop Supabase Auth.
2. **Rebuild + push the Docker image to ECR.** The current ECR image was built before the TPA Portal / Provider Portal / Meow code merged. Build a new image from `main`, push, force-deploy Fargate.
3. **Verify the probes again** after step 2 — `/portal/tpa` should return 200, `POST /api/signup-tpa` should write a real row, `database: "connected"` in health.

### What's actually demo-ready vs production-ready right now
- 🟢 Marketing site at `vantaum.com` — fully real, on Vercel
- 🟢 The codebase on `main` — 212 tests passing, comprehensive feature set
- 🟡 `app.vantaum.com` URL/cert/HTTPS — infrastructure live, but serving stale + demo
- 🔴 Customer onboarding flow on `app.vantaum.com` — **silently broken** until container rebuild + Supabase env wired
- 🔴 Meow billing — code merged, runtime paused (see below)

### Single-sentence summary
**VantaUM is ~70% ready to onboard a real TPA: the code is shipped, the URL is live, but the running container is stale and the database isn't connected. ~30 min of work (rebuild image + wire Supabase env) closes the visible gap; Meow + Auth migration are separate workstreams.**

---

## 🔴 ACTIVE TASKS RIGHT NOW (2026-05-13)

**PAUSED: Meow runtime bootstrap, blocked on Jonah provisioning a new "VantaUM" Meow account.**

> Decision recorded 2026-05-13: Jonah does NOT want PEPM invoice payments routed into the existing Operating Account (8841) or IP Fees Account (2472) inside Vanta HG LLC. A new dedicated **"VantaUM"** account will be provisioned inside Meow (sub-account of Vanta HG LLC, or possibly its own entity — TBD when Jonah sets it up). Bootstrap resumes the moment that account exists.

### What's done in the bootstrap so far (DO NOT redo)
- ✅ Meow API key created in Meow UI for **Vanta HG LLC entity**. Named "VantaUM". 8 scopes verified working (200 OK on `/api-keys/accessible-entities`, `/billing/customers`, `/accounts`). IP allowlist contains `3.81.192.170` (Fargate NAT EIP).
- ✅ Meow API key stored in `vantaum-prod-third-party-keys` Secrets Manager → `meow_api_key`. Length 43 chars, last4 `Tv5s`. **This is the current working key — do not regenerate unless you have a reason.**
- ✅ Bastion IAM role granted `secretsmanager:GetSecretValue` on `vantaum-prod-third-party-keys` (inline policy `ReadThirdPartySecret` on `vantaum-prod-compute-BastionRole201D3308-z9URw5kwddFg`).
- ✅ Bastion confirmed to egress via the allowlisted NAT IP `3.81.192.170`.
- ✅ **Entity ID discovered:** `1a267bae-6772-4a76-bd98-51f5086cb4b3` (Vanta HG LLC). Not stored in secret yet because we're waiting on the VantaUM account.
- ✅ **Existing accounts inside Vanta HG LLC discovered (NEITHER WILL BE USED):**
  - Operating Account (8841) → `20bfdb1e-ac74-4eb1-b8cb-3a6e007bbf52`
  - IP Fees Account (2472) → `ec2d0820-1cb9-4e4b-a30b-240f2f0b467d`
- ✅ Vault has empty slots ready for `meow_entity_id`, `meow_collection_account_id`, `meow_vantaum_product_id`.
- ⚠️ **Allowed payment methods on this Meow setup:** `BANK_TRANSFER`, `INTERNATIONAL_WIRE` only — `ACH_DIRECT_DEBIT` is NOT enabled. When invoices are created, use only `BANK_TRANSFER` in the `payment_method_types` field. The Meow client wrapper in `lib/billing/meow-client.ts` currently includes ACH_DIRECT_DEBIT in the type union; that's fine since it's a default option but callers should pass only `['BANK_TRANSFER']` to `createInvoice`. The `generateInvoice()` function in `lib/billing/invoice-generator.ts` currently passes `['BANK_TRANSFER', 'ACH_DIRECT_DEBIT']` — change this to `['BANK_TRANSFER']` only before the first real invoice. (Trivial 1-line edit.)

### Earlier troubleshooting lessons (DON'T REPEAT THESE)
- The AWS Console plaintext JSON editor appended duplicate `meow_api_key` entries twice instead of replacing. **Don't use Console for the third-party-keys vault** — use `aws secretsmanager put-secret-value` from a tmp JSON file via CLI.
- A `curl -sv` (verbose mode) on a header-auth request leaks the API key into stdout. **Never use `-v` or `--trace` on any command with a secret in a header.** The first Meow key (22 chars, last4 `O0jA`) was leaked and revoked because of this.
- Meow returns 403 (not 401) for IP-allowlist-blocked requests regardless of key validity. If a known-good key suddenly 403s, suspect the IP allowlist before scopes.

### When the VantaUM Meow account exists, resume here
1. Find the new account UUID via SSM on bastion:
   ```
   curl -s -H "x-api-key: $MEOW_KEY" https://api.meow.com/v1/accounts
   ```
   Look for the one with nickname/name "VantaUM".
2. Write entity_id + the new collection_account_id into the secret via CLI (NOT Console):
   ```bash
   aws secretsmanager get-secret-value --profile vantaum --region us-east-1 --secret-id vantaum-prod-third-party-keys --query SecretString --output text > /tmp/cur.json
   python3 -c "import json; d=json.load(open('/tmp/cur.json')); d['meow_entity_id']='1a267bae-6772-4a76-bd98-51f5086cb4b3'; d['meow_collection_account_id']='<NEW_VANTAUM_UUID>'; print(json.dumps(d))" > /tmp/new.json
   aws secretsmanager put-secret-value --profile vantaum --region us-east-1 --secret-id vantaum-prod-third-party-keys --secret-string file:///tmp/new.json
   rm /tmp/cur.json /tmp/new.json
   ```
3. Edit `lib/billing/invoice-generator.ts` line that passes `payment_method_types`: change `['BANK_TRANSFER', 'ACH_DIRECT_DEBIT']` to `['BANK_TRANSFER']`.
4. Run `scripts/bootstrap-meow-product.ts` from the bastion via SSM. Capture the returned product UUID. Write it to the secret as `meow_vantaum_product_id` via the same pattern as step 2.
5. **Update `infra-aws/lib/compute-stack.ts`** to wire all 4 Meow env vars from the secret onto the Fargate task definition. Pattern: existing `HELLOSIGN_API_KEY` wiring. Add `MEOW_API_KEY`, `MEOW_ENTITY_ID`, `MEOW_COLLECTION_ACCOUNT_ID`, `MEOW_VANTAUM_PRODUCT_ID`. Also add `ENABLE_REAL_MEOW=true` as a plain env var (not secret).
6. `cdk deploy vantaum-prod-compute` then `aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app --force-new-deployment`.
7. Smoke test: hit `https://app.vantaum.com/admin/invoices`, generate a test invoice for a test client (need a client with `contact_email` set), verify the invoice shows up in the Meow dashboard with the right total and that the local `invoices` row has `meow_invoice_id` populated.

**Plan A complete + AWS cutover complete.** All 8 steps shipped. `https://app.vantaum.com` is live on AWS Fargate with HTTPS. The temporary ALB hostname is no longer the way in.

**Live URLs:**
- `https://app.vantaum.com/api/health` → 200, `{"status":"healthy", ...}`
- `http://app.vantaum.com/...` → 301 redirect to HTTPS
- Marketing `vantaum.com` + `www.vantaum.com` → still Vercel (unchanged)

**Cutover details (done 2026-05-13):**
- Secrets vault `vantaum-prod-third-party-keys` populated. Real values: `anthropic_api_key` (108 chars), `cron_secret` (64-char openssl rand). Everything else intentionally empty — Supabase wasn't actually set up so the app boots in demo mode for DB-backed pages; HelloSign / Phaxio / Google Vision / Sentry / Gravity Rail not wired yet but the slots exist for when each is set up.
- Fargate force-new-deployment: `aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app --force-new-deployment`.
- ACM cert: `arn:aws:acm:us-east-1:309921834034:certificate/aec5ab1f-bf47-498e-9990-2bfbcd85338a` for `app.vantaum.com`, DNS-validated via Squarespace CNAME, valid until 2026-11-26.
- ALB listener config:
  - Port 443: HTTPS, ACM cert attached, TLS-1.3-1.2 policy, forwards to existing target group.
  - Port 80: 301 redirect → HTTPS (Host=#{host}, Path=/#{path}, Query=#{query}).
  - ALB security group `sg-0f06949bdce6982d9`: 80 + 443 open to 0.0.0.0/0.
- Squarespace DNS records added on vantaum.com:
  - `_84194f7149cbda81841f5d02ef257c06.app.vantaum.com CNAME _13a6dc4caddd04486f6bd4674c1fbb78.jkddzztszm.acm-validations.aws.` (validation; can be removed but harmless to keep)
  - `app.vantaum.com CNAME vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com` (live traffic)

**Backlog from STATE.md remaining:**
- Auto-book weekly check-in calendar invite
- ~~TPA system connector framework (FHIR / X12)~~ ✅ inbound rails BUILT 2026-07-09 — `POST /api/connect/fhir/Claim/$submit` (Da Vinci PAS) + `POST /api/connect/x12/278` (005010X217), both funneling into the shared ledger-idempotent ingest (`lib/partner/ingest.ts`). See `docs/CONNECTOR_RAILS.md`. Remaining: sftp_batch rail, per-vendor verification, native-dialect webhook push.
- Meow billing integration (locked decision: not Stripe)
- RingCentral phone/email/fax auto-provisioning
- DL upstream/downstream activity view
- Real PDF upload on case submission (currently text description only)
- Fill remaining secrets (Supabase if reviving, HelloSign client ID, others) when their owning service is actually set up

### LOCKED DECISIONS (don't relitigate)

- **Billing path: Meow.** Not Stripe. When billing comes up, it's Meow. Spec already exists in Jonah's plan.
- **Florida governance + Jonathan Arias as signer** for all VantaUM contracts. Hardcoded in `lib/contracts/templates/msa-with-baa-v1.ts`.
- **Marketing on Vercel forever** at `vantaum.com`. Authenticated app on AWS at `app.vantaum.com` (post-cutover).
- **Auth in V1: hybrid mode** (Supabase Auth + AWS-everything-else). Cognito magic-link Lambdas are deployed and ready but not cutover. Decision: don't cut over auth until after first paying customer.
- **Practice provisioning: self-serve invite from TPA admin** (Plan i). Auto-discovery from inbound faxes (Plan ii) is V2.
- **Customer portals are TWO portals:**
  - TPA-facing portal — sees all cases in their network, can upload on behalf of any provider
  - Provider-facing portal — sees only their practice's cases, scoped by practice_id
  - Shared CaseUploadForm component, different access guards
- **AWS account already has BAA active.** All infra deployed, just needs secrets + DNS to cut over.

### PLAN A — 8-step sequential workstream

**Step 1 — Lock Meow as the billing path** (5 min)
- Save to memory + this doc. Done above ✅

**Step 2 — Finish AWS cutover Tasks 1-3** (~2 hrs)
- Task 1: fill secrets vault `vantaum-prod-third-party-keys` in AWS Secrets Manager. The Vercel pull showed most keys are marked Sensitive (can't be pulled) and several services (Phaxio, Google Vision, Sentry, Gravity Rail) were never actually set up. So really just need: `anthropic_api_key` (Claude has the value locally from .env.vercel.local pull), `cron_secret` (generate fresh: `openssl rand -hex 32`), `hellosign_api_key` + `hellosign_client_id` (from Dropbox Sign dashboard), and the 3 Supabase keys (from supabase.com dashboard since they're Sensitive in Vercel). Leave the rest as empty strings — graceful degradation handles them.
- Task 2: `aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app --force-new-deployment --profile vantaum --region us-east-1` then verify `curl http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health` returns `"database":"connected"`.
- Task 3: ACM cert for `app.vantaum.com` + add HTTPS:443 listener to ALB + CNAME `app.vantaum.com` → ALB DNS. Detailed steps already in the cutover section below.

**Step 3 — Practices schema** (~1 hr)
- New migration `019_practices.sql`:
  - `practices` table (id, name, npi, address, phone, client_id FK to clients, created_at)
  - `practice_users` table (id, practice_id FK, user_id FK to auth.users, role check 'admin'|'staff', created_at) — OR add `practice_id` + `user_role_at_practice` columns to `user_profiles`. **Decision pending**: separate table is cleaner for a user-belongs-to-many-practices model; column on user_profiles is simpler for V1's "one user, one practice" assumption. Go with separate `practice_users` table for forward-compatibility.
  - Indexes on `practice_users(user_id)` and `practice_users(practice_id)`
  - RLS: providers see their own practice; TPA admins see all practices linked to their client_id
- Apply to RDS via SSM bastion (pattern in `docs/aws-migration-status.md`)
- Add `practice_id` to `client_concierge_assignments` already exists (V2-ready slot)

**Step 4 — Shared CaseUploadForm component** (~1 hr)
- `components/CaseUploadForm.tsx` — React component
- Fields: patient name (or pseudonymized ID), DOB, member ID, procedure codes (CPT/HCPCS), procedure description, clinical question/justification, clinical document upload (multiple PDFs), priority (standard/urgent/expedited)
- Wraps the existing `/api/cases` POST flow
- Accepts a `scope` prop: `{ client_id: string; practice_id?: string }` — used to pre-fill those fields and constrain backend writes
- Uses existing `lib/intake/efax/storage.ts`-style upload path → S3 via storage adapter

**Step 5 — TPA portal `/portal/tpa`** (~2 hrs)
- Two surfaces:
  - `/portal/tpa` — list view of all cases for `client_id = current user's tpa`
  - `/portal/tpa/submit` — upload form, can pick which practice the case is from (dropdown of practices linked to this TPA)
- Access guard: user_profiles.role = 'client' AND clients.id maps to the current user
- Reuses CaseUploadForm with `scope = { client_id: user's tpa }`

**Step 6 — Provider portal `/portal/provider`** (~2 hrs)
- Same two surfaces but scoped:
  - `/portal/provider` — list view of cases where `practice_id = current user's practice`
  - `/portal/provider/submit` — upload form, practice_id auto-filled, can't be changed
- Access guard: user is linked to a practice via practice_users table
- Reuses CaseUploadForm with `scope = { client_id: practice's client_id, practice_id: user's practice }`

**Step 7 — Practice invite flow** (~1 hr)
- TPA admin endpoint: `POST /api/tpa/practices` — create a new practice for this TPA
- TPA admin endpoint: `POST /api/tpa/practices/[id]/invite` — invite an email to be a practice user. Generates a magic link via existing `provisionTpaUserAndMagicLink` pattern from `lib/contracts/client-onboarding.ts`.
- UI: a "Practices" tab inside `/portal/tpa` showing the list + add/invite buttons

**Step 8 — Tests, STATE.md update, commit + push** (~30 min)
- Unit tests for the new access guards (provider can't see other practice's cases, TPA can see all)
- Integration test for the upload flow with practice scoping
- Update this STATE.md section: mark Plan A complete, document the new portal URLs, list the backlog items still remaining

### Old AWS cutover task list (parked — resume any time)

### What's built tonight (product features)

- **Meow banking integration for PEPM invoicing** (DONE 2026-05-13)
  - Migration 020: `clients.meow_customer_id`, `invoices.meow_invoice_id` + `meow_status` + `meow_invoice_number` + `meow_last_synced_at` + `meow_payment_url`. Partial indexes on populated rows + OPEN/DRAFT status.
  - `lib/billing/meow-client.ts` — typed fetch wrapper for the 4 Meow endpoints we use: `POST /billing/customers`, `POST /billing/products`, `POST /billing/invoices`, `GET /billing/invoices/{id}`. Demo-mode safe: returns deterministic stubs when `ENABLE_REAL_MEOW` is false. Error path returns `{ ok: false, status, code, message }` discriminated union. Translates Meow's `DRAFT/OPEN/PAID/UNCOLLECTIBLE/VOID` to our local `draft/sent/paid/void` via `meowStatusToLocal()`.
  - `lib/billing/invoice-generator.ts` — `generateInvoice()` now pushes to Meow after the local insert. Lazy customer creation (first invoice per client creates Meow customer, stores `meow_customer_id` on clients row, reuses on subsequent invoices). Line item uses the singleton `MEOW_VANTAUM_PRODUCT_ID` Product (run `scripts/bootstrap-meow-product.ts` once to create it). Push failure is **non-fatal** — local row stays as draft, admin can retry. Result type now includes a discriminated `meow` field: `{ meowed: true, skipped: 'disabled' }` | `{ meowed: true, meow_invoice_id, meow_payment_url }` | `{ meowed: false, meow_error }`.
  - `pushInvoiceToMeow()` exported so a future `/api/admin/invoices/[id]/push-to-meow` retry endpoint can call it standalone.
  - Cron: `GET /api/cron/meow-invoice-sync` polls every 30 min, finds invoices with `meow_status IN ('DRAFT', 'OPEN')`, calls `getInvoice()` to check for transitions, updates `meow_status` + local `status` + `paid_at`/`voided_at` as needed. Audit-logs every transition. Added to `vercel.json` schedule. Bearer CRON_SECRET auth.
  - Env vars in `lib/env.ts`: `MEOW_API_KEY`, `MEOW_ENTITY_ID` (optional), `MEOW_COLLECTION_ACCOUNT_ID`, `MEOW_VANTAUM_PRODUCT_ID`, `ENABLE_REAL_MEOW` (opt-in flag matching ENABLE_REAL_ANTHROPIC / ENABLE_REAL_HELLOSIGN pattern). `isRealMeowEnabled()` + `getMeowConfig()` helpers.
  - `scripts/bootstrap-meow-product.ts` — one-time setup: creates "VantaUM PEPM" Product in Meow, prints UUID to copy into env. Idempotency check refuses to run if `MEOW_VANTAUM_PRODUCT_ID` already set.
  - Admin UI: `/admin/invoices` now shows a "Meow" column with the Meow status + "Pay link →" hosted invoice URL when present, "not pushed" when local-only.
  - Tests: 9 new (`meow-client.test.ts`) covering demo-mode stubs for all 4 methods + the 5-way status translation table. 211/211 tests passing total.
  - **To go live with real Meow:** add `MEOW_API_KEY`, `MEOW_COLLECTION_ACCOUNT_ID`, `ENABLE_REAL_MEOW=true` to env, run `scripts/bootstrap-meow-product.ts` to create the Product, copy the returned UUID into `MEOW_VANTAUM_PRODUCT_ID`. Cron picks up status changes every 30 min.

- **TPA Portal + Provider Portal + Practices management + Invite flow** (DONE 2026-05-13) — Plan A Steps 3-7
  - Migration 019: `practices` table (NPI, address, specialty, weekly volume) + `practice_users` junction (user ↔ practice with admin/staff role) + `practice_id` column on `cases`. RLS: internal staff full access; TPA users see their tenant's practices; practice users see only their practices.
  - `components/CaseUploadForm.tsx` — shared upload form (patient block, procedure codes + clinical justification, service category + priority, optional practice picker, documents description). Wraps existing `POST /api/cases` with duplicate detection (409 → link to existing case).
  - `/portal/tpa` — TPA dashboard with stats + recent cases + practice sidebar. `/portal/tpa/submit` with practice dropdown. `/portal/tpa/practices` with inline add-practice form + per-practice invite (email + staff/admin role → magic link via existing `provisionTpaUserAndMagicLink` → `practice_users` insert with cross-tenant guard).
  - `/portal/provider` — provider dashboard scoped to single practice via `practice_users` lookup. `/portal/provider/submit` with practice_id auto-filled and locked.
  - API: `GET /api/tpa/me`, `GET/POST /api/tpa/practices`, `POST /api/tpa/practices/[id]/invite`, `GET /api/provider/me`.
  - Nav: "TPA Portal" + "Provider Portal" added.
  - **202/202 tests still passing. Build clean.** No new tests for portals yet — integration tests are a future task.

- **Auto-assign Delivery Lead + Concierge on signup approval** (DONE 2026-05-13)
  - New `lib/delivery/auto-assign.ts` ties existing helpers together
  - Hooked into `app/api/admin/signups/[id]/approve/route.ts` — runs after client tenant is created
  - Picks the concierge with most spare capacity that can absorb the TPA's expected weekly auth volume
  - Derives the Delivery Lead from that concierge's `delivery_lead_id`
  - Writes a row to `client_concierge_assignments` (whole-client, practice_id=NULL for V1)
  - Audit-logged: `delivery_team_auto_assigned` on success, `delivery_team_auto_assign_failed` with code on capacity/empty-pool failures, `delivery_team_auto_assign_threw` on unexpected errors
  - Admin UI on `/admin/signups/[id]` shows the assignment outcome inline in the success message
  - Failure is non-fatal — approval succeeds, admin gets told to assign manually
  - 7 new unit tests covering no_concierges, no_capacity, happy path, persist_failed, null-DL graceful handling
  - **Test pass: 202/202**

### Next product features in priority order (from Jonah's spec)

The signup → contract → e-sign → onboarding flow exists. Auto-assignment was the missing connective tissue. Remaining gaps from the original spec:

1. ~~Auto-assign DL + Concierge on signup approval~~ ✅ DONE
2. **Auto-book weekly check-in calendar invite** (~2 hrs) — onboarding wizard captures the time preference, but no calendar invite gets sent. Needs iCal-attachment-in-email or Google Calendar API integration.
3. **Practices table + per-physician-office concierge routing** (~3 hrs) — `practice_id` reserved on `client_concierge_assignments` but no `practices` table exists yet.
4. ~~**TPA system connector framework**~~ ✅ FHIR PAS + X12 278 inbound rails built 2026-07-09 (`docs/CONNECTOR_RAILS.md`); first vendor-specific verification still pending a named TPA.
5. **Real billing collection at signup** (~3 hrs) — Stripe checkout link tied to contract signing.
6. **Concierge phone/email/fax auto-provisioning via RingCentral** (~4 hrs) — schema fields exist (`ringcentral_phone`, `intake_email`, `intake_efax`), no provisioning happens.
7. **Activity upstream/downstream view for Delivery Lead** (~2 hrs) — DL sees their team's load; missing: case flow visibility.

### Old AWS cutover task list (parked — resume any time)

Three tasks in order. Pick this up after the product features feel ready to demo:

### Task 1 — Fill secrets vault (PARKED)
- AWS Console → Secrets Manager → `vantaum-prod-third-party-keys` → Retrieve secret → Edit → Plaintext tab
- 13 JSON fields to fill. Mapping below.
- **Where we are at thread compact:** Jonah is on the Plaintext editor. Hasn't pasted values yet.
- **Source for the values:** Vercel project `vantahg-brief-engine` → Settings → Environment Variables. Each value needs to be copy-pasted by Jonah (Claude cannot see them and shouldn't ask for them in chat).
- **Three special cases:**
  - `hellosign_client_id` — NOT in Vercel. Get from app.hellosign.com → API → API Settings.
  - `cron_secret` — generate fresh: `openssl rand -hex 32`.
  - Anything not configured in Vercel (e.g. Phaxio if not set up) — leave `""`.
- **Don't save yet** — once filled, paste the JSON back to Claude (with values redacted as `<filled>`) so Claude verifies the shape.

**Vercel → AWS JSON key mapping:**

| Vercel env var | AWS JSON key |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase_url` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabase_anon_key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase_service_role_key` |
| `ANTHROPIC_API_KEY` | `anthropic_api_key` |
| `HELLOSIGN_API_KEY` | `hellosign_api_key` |
| (Dropbox Sign dashboard) | `hellosign_client_id` |
| `PHAXIO_API_KEY` | `phaxio_api_key` |
| `PHAXIO_API_SECRET` | `phaxio_api_secret` |
| `PHAXIO_CALLBACK_TOKEN` | `phaxio_callback_token` |
| `GOOGLE_VISION_API_KEY` | `google_vision_api_key` |
| `SENTRY_DSN` | `sentry_dsn` |
| `GRAVITY_RAIL_API_KEY` | `gravity_rail_api_key` |
| (generate fresh) | `cron_secret` |

### Task 2 — Force Fargate redeploy
After Task 1 saves:
```bash
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```
Then wait ~2 min and:
```bash
curl http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health
```
Expected: `"database":"connected"`. If `demo_mode`, Supabase URL is empty or wrong in the secret.

### Task 3 — ACM cert + HTTPS + DNS for app.vantaum.com
1. AWS Console → Certificate Manager (us-east-1) → Request → `app.vantaum.com` → DNS validation
2. Copy the validation CNAME from ACM → add to vantaum.com DNS (Vercel DNS / Cloudflare / wherever the apex lives)
3. Wait for cert to issue (5-30 min — ACM auto-detects)
4. EC2 → Load Balancers → vantaum-prod-alb → Listeners → Add listener → HTTPS:443 → forward to existing target group with the new cert
5. Edit port 80 listener → change action to "Redirect to" port 443
6. Add CNAME record: `app.vantaum.com` → `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com`
7. Test: `curl https://app.vantaum.com/api/health` → 200

### After all 3 tasks
- AWS is live and serving on `https://app.vantaum.com`
- Marketing site stays on Vercel at `vantaum.com`
- Update the marketing site's "Sign In" button if it doesn't already point at `https://app.vantaum.com/login`
- Move to real product functionality (next priorities to be set by Jonah)

### Resume command for a fresh thread
```bash
cd ~/vantahg-brief-engine
git pull origin main
head -300 STATE.md
tail -150 STATE.md   # for the ACTIVE TASKS section
```
Then ask Jonah which task he's on.

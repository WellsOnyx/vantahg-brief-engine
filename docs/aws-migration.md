# VantaUM AWS Migration Handoff

**Audience:** Cole
**Status:** Application code + adapter pattern + CDK skeleton ready. Stubs marked with `not implemented`. No AWS resources provisioned yet.
**Last updated:** 2026-05-12

This is the doc you're looking for when you sit down to start migrating VantaUM off Vercel + Supabase onto AWS. Everything you need to know about where things live and what's already been built for you.

---

## TL;DR

You do **not** need to rewrite the application. The codebase is set up so swapping vendors is a small number of focused changes:

1. Fill in five adapter stubs at `lib/adapters/*/{s3,cognito,ses}.ts`
2. Fill in six CDK stack stubs at `infra-aws/lib/*.ts`
3. Run the existing SQL migrations against RDS
4. Backfill data (S3 sync, password reset emails)
5. DNS cutover from Vercel to ALB

No application route, page, or business-logic file should need to change. If you find yourself editing files outside of `lib/adapters/` and `infra-aws/`, stop and check whether you're going off-pattern.

---

## Architecture map

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Application code (one source of truth — works on Vercel AND AWS)        │
│   app/        — Next.js pages + API routes                              │
│   lib/        — business logic, all vendor-agnostic                     │
│   supabase/migrations/ — SQL schema (works on RDS Postgres unchanged)   │
└──────────────┬──────────────────────────────────────────────────────────┘
               │
               │   imports
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Adapter layer (one interface, two implementations per vendor)           │
│   lib/adapters/storage/ ── supabase.ts (live) | s3.ts      (stub)       │
│   lib/adapters/auth/    ── supabase.ts (live) | cognito.ts (stub)       │
│   lib/adapters/email/   ── smtp.ts     (live) | ses.ts     (stub)       │
└──────────────┬──────────────────────────────────────────────────────────┘
               │
               │   selected by env flags
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Deployment target                                                       │
│   Vercel + Supabase (now)         OR     AWS (your target)              │
│                                                                         │
│   ENABLE_AWS_STORAGE=true → flip to S3                                  │
│   ENABLE_AWS_AUTH=true    → flip to Cognito                             │
│   ENABLE_AWS_EMAIL=true   → flip to SES                                 │
│   Postgres URL points at RDS instead of Supabase                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## What's already built

### Adapter interfaces

Three vendor-agnostic interfaces define the surface the app talks to. Each lives in `lib/adapters/<vendor>/types.ts`:

- **`StorageAdapter`** — upload / download / signedUrl / remove. See `lib/adapters/storage/types.ts`.
- **`AuthAdminAdapter`** — createUserWithMagicLink / getUserByEmail. See `lib/adapters/auth/types.ts`.
- **`EmailAdapter`** — send. See `lib/adapters/email/types.ts`.

Each interface returns discriminated success/error union types (`{ ok: true, ... } | { ok: false, code, message }`) instead of throwing. This forces callers to handle failure paths explicitly.

### Supabase implementations (production today)

- `lib/adapters/storage/supabase.ts`
- `lib/adapters/auth/supabase.ts`
- `lib/adapters/email/smtp.ts` (works for any SMTP — Supabase, SES SMTP, Sendgrid, etc.)

### AWS stubs (your fill-in points)

- `lib/adapters/storage/s3.ts` — every method throws `not implemented`. Migration checklist in the file header.
- `lib/adapters/auth/cognito.ts` — full notes on the magic-link custom-auth flow design.
- `lib/adapters/email/ses.ts` — SES SDK adapter for native bounce tracking. **Note:** you can use SES via the existing SMTP adapter without writing any code — just point `SMTP_HOST` at the SES SMTP endpoint. Only fill in this SDK adapter if you want native bounce tracking + suppression lists.

### CDK stacks (the infra to back the AWS adapters)

In `infra-aws/`:

- `bin/vantaum.ts` — app entrypoint, instantiates all six stacks per env.
- `lib/database-stack.ts` — RDS Postgres + Secrets Manager. Sizing notes in comments.
- `lib/storage-stack.ts` — S3 buckets, KMS, logging. One bucket per logical name.
- `lib/auth-stack.ts` — Cognito User Pool + custom-auth Lambdas + DynamoDB for OTP codes.
- `lib/email-stack.ts` — SES configuration set + bounce/suppression handling.
- `lib/compute-stack.ts` — Fargate service + ALB + ECR.
- `lib/cron-stack.ts` — EventBridge schedules replacing Vercel Cron.

Each stack file is a class with the constructor + a `// TODO:` list inside. When you fill it in, the stack ID and props plumbing stay the same.

### The existing application code that's vendor-aware (small list)

Most of the codebase doesn't touch vendors directly. The ones that do, listed exhaustively so you know your real surface area:

| File | What it does | Adapter? |
|---|---|---|
| `lib/supabase.ts` | Service-role client factory | Replace with a Drizzle/pg client wrapper. Same export shape. |
| `lib/supabase-server.ts` | SSR cookie-aware client | Replace with Cognito session reader. ~50 lines. |
| `lib/supabase-browser.ts` | Browser auth helpers | Replace with Cognito browser SDK. |
| `lib/auth-guard.ts` | requireRole() — reads user_profiles | Should work unchanged once `getUserId()` from session returns the Cognito sub. |
| `lib/contracts/client-onboarding.ts` | Provisions TPA user + magic link | ✅ Already uses AuthAdminAdapter. |
| `lib/notifications.ts` | Sends notifications via SMTP | Should be refactored to use `getEmailAdapter()`. Quick win — ~30 minutes. |
| `lib/intake/efax/storage.ts` | Stores eFax PDFs | Should be refactored to use `getStorageAdapter()`. Quick win — ~1 hour. |
| `app/api/admin/signups/[id]/contract/route.ts` | Contract PDF storage | Same — refactor to `getStorageAdapter()`. |
| `app/api/admin/signups/[id]/generate-contract/route.ts` | Contract render + store | Same. |
| `app/api/admin/contracts/[id]/send-for-signature/route.ts` | Downloads stored contract PDF | Same. |

The refactor of these last five storage callers wasn't included in the initial pass — pattern was proven with `client-onboarding.ts` to keep the diff small. You can either do the refactor as part of the migration or leave the Supabase calls in place until cutover (they keep working until env vars change).

---

## Migration sequencing — recommended order

This is the order Cole-with-no-context-on-the-codebase should follow. Each step is independently shippable, so if you have to pause, you can. Total estimated effort: ~2 weeks of focused work.

### Phase 1 — Database (day 1-3)

1. **Provision RDS** via `cdk deploy vantaum-prod-database`. Multi-AZ, gp3 100GB.
2. **Apply migrations.** Run every file in `supabase/migrations/` in order via psql:
   ```bash
   for f in supabase/migrations/*.sql; do
     psql "$RDS_URL" -f "$f"
   done
   ```
3. **Replace `auth.uid()` in RLS policies.** Supabase's `auth.uid()` returns the JWT sub. On Cognito, the equivalent is whatever your session middleware sets. Replace with a session-context GUC:
   ```sql
   SELECT current_setting('vantaum.user_id', true)::uuid;
   ```
   Your Next.js middleware will set this via `SET LOCAL vantaum.user_id = '...'` on every request.
4. **Backfill data.** `pg_dump --data-only` from Supabase, restore into RDS. Validate row counts match.
5. **Test read parity.** Stand up a temporary `vantaum-canary.wellsonyx.com` pointing at AWS-side RDS via the still-on-Vercel app — verify reads return identical results.

### Phase 2 — Storage (day 4-5)

1. **Provision S3** via `cdk deploy vantaum-prod-storage`.
2. **Sync from Supabase Storage.** Use the Supabase service-role credentials with `aws s3 sync` from a temp EC2 instance.
3. **Refactor storage callers** (the 5 files in the table above) to use `getStorageAdapter()`. Same diff at every call site — change `supabase.storage.from(bucket).X()` to `getStorageAdapter().X(bucket, ...)`.
4. **Fill in `lib/adapters/storage/s3.ts`.** Migration checklist in the file header.
5. **Flip `ENABLE_AWS_STORAGE=true`** in the AWS-deployment env. Storage writes now land in S3; old downloads still work because Supabase Storage stays online during the transition.

### Phase 3 — Email (day 6)

1. **Verify vantaum.com in SES.** DKIM + SPF + DMARC records via Route 53.
2. **Move SES out of sandbox.** AWS support ticket, 24-48h.
3. **Easiest path:** point `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` at the SES SMTP endpoint and credentials. The existing `SmtpEmailAdapter` works as-is, no code changes.
4. **Optional SDK adapter:** fill in `lib/adapters/email/ses.ts` if you want native bounce tracking via SNS topic + DynamoDB suppression table.
5. **Refactor `lib/notifications.ts`** to call `getEmailAdapter().send(...)` instead of inlining the nodemailer logic. ~30 minutes.

### Phase 4 — Auth (day 7-9, the big one)

This is the hardest piece because Cognito has no native magic link.

1. **Provision Cognito** via `cdk deploy vantaum-prod-auth`. Critical: declare every custom attribute the app uses **at creation time** — `custom:signup_id`, `custom:client_id`, `custom:provisioned_by`. Cognito does NOT allow adding custom attributes to an existing pool.
2. **Build the three custom-auth Lambdas:**
   - `defineAuthChallenge.ts`
   - `createAuthChallenge.ts` (generates OTP code, sends via SES, stashes in DynamoDB with 15-min TTL)
   - `verifyAuthChallenge.ts` (checks the user's submitted code)
3. **Build a `/api/auth/callback` Next.js route** that handles the code exchange and sets HttpOnly session cookies.
4. **Replace `lib/supabase-server.ts` + `lib/supabase-browser.ts`** with Cognito-aware versions that read those cookies.
5. **Fill in `lib/adapters/auth/cognito.ts`.** Full notes in the file header.
6. **Migration:** Cognito has no password-hash import. Plan a one-time "we're upgrading login — click here to set your new password" email to all active Supabase Auth users at cutover.
7. **Flip `ENABLE_AWS_AUTH=true`** when ready.

### Phase 5 — Compute (day 10-12)

1. **Containerize the Next.js app.** Add `output: 'standalone'` to `next.config.ts`. Create a multi-stage Dockerfile at the repo root.
2. **Provision Fargate** via `cdk deploy vantaum-prod-compute`. ECR + ALB + service.
3. **Push image** via `docker push <ecr-url>`.
4. **Smoke test** at `vantaum-aws.wellsonyx.com` (temporary hostname).
5. **DNS cutover.** Change `vantaum.com` A record from Vercel to ALB. Keep Vercel deploy running for 30 days as fast rollback.

### Phase 6 — Cron (day 13)

1. **Provision EventBridge schedules** via `cdk deploy vantaum-prod-cron`.
2. **Verify** `/api/cron/efax-process` fires every minute.
3. **Drop the Vercel project** once everything is verified.

---

## Things you do NOT need to change

Listed explicitly to save you time:

- **Anthropic API integration** (`lib/llm/`, `lib/claude.ts`) — vendor-neutral.
- **Sentry** — works the same on AWS.
- **Phaxio eFax** — vendor-neutral webhook handling.
- **Google Vision OCR** — vendor-neutral.
- **Dropbox Sign / HelloSign** — vendor-neutral.
- **Gravity Rail** — vendor-neutral (it's an external service).
- **RingCentral** — vendor-neutral.
- **All business logic** (`lib/sla-calculator.ts`, `lib/fact-checker.ts`, `lib/intake/efax/ai-extractor.ts`, etc.)
- **All UI** (every page under `app/`).
- **All API routes** other than `/api/auth/*` which need session-handling updates.
- **All tests.**

---

## Gotchas + landmines

1. **Cognito custom attributes are immutable.** You cannot add `custom:foo` to an existing pool. Declare every custom attribute up-front in `AuthStack`. If you discover you need a new one later, you create a new pool and migrate users.

2. **Cognito has no `auth.admin.generateLink()`.** The magic-link flow requires custom-auth Lambdas. Don't try to fake it with a temporary password — the UX is bad and users will think they're being phished.

3. **S3 has no "fail if exists" mode by default.** Use `IfNoneMatch: '*'` on PutObject to mimic Supabase's `upsert: false` semantics.

4. **Supabase RLS uses `auth.uid()` everywhere.** RDS doesn't have `auth.*`. Either replace all RLS with application-level checks (cleaner, what most AWS-native apps do) OR set `vantaum.user_id` as a GUC in middleware and use `current_setting()`.

5. **Vercel's edge runtime ≠ Node runtime.** A few of our middleware files (`proxy.ts`) use edge-runtime APIs that may need adjustment for Fargate. Check for `runtime: 'edge'` exports and migrate to standard Node.

6. **Don't try to lift-and-shift Vercel KV / Blob / Edge Config** — we don't use them. If you see references to `@vercel/*` packages, they're either unused or already abstracted.

7. **Existing migrations directory is the source of truth for schema.** Don't write CDK code that creates tables — use `psql` for all schema changes, even after cutover.

---

## Verification checklist (cutover day)

Before flipping the DNS:

- [ ] All migrations applied to RDS, row counts match Supabase
- [ ] S3 sync complete, sample 50 files for byte-identity vs Supabase Storage
- [ ] SES out of sandbox, test email to a real address works
- [ ] Cognito magic-link flow tested end-to-end on `vantaum-aws.wellsonyx.com`
- [ ] Fargate health check at `/api/health` returns 200
- [ ] EventBridge fired `/api/cron/efax-process` at least once successfully
- [ ] Sentry receiving events from Fargate
- [ ] CloudWatch alarms set on: ALB 5xx rate, Fargate task failures, RDS CPU, RDS connections, SES bounce rate
- [ ] CRON_SECRET, HELLOSIGN_*, ANTHROPIC_API_KEY all in Secrets Manager
- [ ] Backup verification: restore an RDS snapshot to a scratch instance and confirm

After flipping:

- [ ] Spot-check 10 signups: TPA receives magic link, clicks, lands in /client/cases
- [ ] Spot-check 5 eFaxes: webhook → OCR → AI extract → case created
- [ ] Spot-check 3 determinations: brief generates, fact-check runs, PDF renders
- [ ] /admin/setup shows all green
- [ ] Cost dashboard sane (compare first-week AWS bill to projection)

Rollback plan: change DNS back to Vercel. Vercel project stays warm for 30 days post-cutover. Supabase project stays read-only for 30 days. After 30 days, decommission both.

---

## Questions for Jonah before you start

These are decisions that influence the migration but weren't locked in at the time of this writing:

1. **Single AWS account or org with sub-accounts?** Sub-accounts are HIPAA-best-practice but cost more in admin overhead.
2. **Region?** Default `us-east-1` for cheapest + most SES features. `us-west-2` if there's a latency reason. Don't go `us-east-2` — fewer SES dedicated IP options.
3. **CloudFront?** For `/public-assets` only, or in front of the whole app? Mostly a perf/cost decision.
4. **Snowflake-style data warehouse for analytics?** Right now we don't have one. If we want one, RDS → Snowflake CDC via Fivetran/Airbyte is the standard path.
5. **VPC strategy?** Dedicated for VantaUM, or share with other Wells Onyx properties (e.g. wellsonyx-outbound, wellsonyx-org)?

Each one has an opinion in this doc but worth a 15-minute conversation with Jonah before locking in.

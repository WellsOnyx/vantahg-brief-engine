# VantaUM — Build State

**This is the single source of truth for "where the build is right now."**
Future Claude/Cole/Jonah sessions: read this first.

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

## 🔴 ACTIVE TASKS RIGHT NOW (2026-05-13)

**Current workstream: "Plan A — Provider + TPA portals + AWS cutover, sequential."** Jonah confirmed Plan A on 2026-05-13 after I outlined two paths. If you're a fresh thread, this is the work in flight. Estimated ~10 focused hours, broken into 8 steps below. Do them in order.

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
4. **TPA system connector framework** (~big) — start with one specific connector (FHIR or X12 EDI) once we know which TPA wants in first.
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

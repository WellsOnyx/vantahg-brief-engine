# Morning Checkpoint - 2026-05-13

**Last update:** End of overnight session
**Total tests:** 176 passing
**Commits pushed to `main`:** Yes — all work is on the canonical branch

## TL;DR

Three product features shipped (Concierge UI, Dropbox Sign polish, PEPM invoicing) and the AWS migration is **structurally complete**. The Vercel production app is unchanged and serving customers as before. AWS account `309921834034` has 6 CloudFormation stacks live and ready; flipping a single env flag swaps real traffic to AWS once you fill in API key secrets.

## Product features shipped

### 1. Concierge UI (`/concierge`)
- Front-line operator dashboard
- API: `GET /api/concierge/me`, `GET /api/concierge/queue`
- Schema: `cases.assigned_concierge_id` + `concierge_assigned_at` (migration 017)
- Demo-mode safe, ready to use today on the Vercel deploy
- Added to top nav as "My Concierge"

### 2. Dropbox Sign polish
- New: `POST /api/admin/contracts/[id]/resend` (re-send reminder email)
- New: `POST /api/admin/contracts/[id]/void` (cancel signature request, mark void)
- Admin signup detail page now has Resend + Void buttons with confirmation
- Already-signed contracts blocked from void (409); already-void blocked too

### 3. PEPM Invoicing (`/admin/invoices`)
- One invoice per client per month, generated on demand
- API: `GET /api/admin/invoices`, `POST /api/admin/invoices`
- `lib/billing/invoice-generator.ts` is pure / tested
- Schema: `invoices` table (migration 018)
- Unique constraint on `(client_id, period_start)` prevents double-billing
- Invoice numbering `VUM-INV-YYYY-NNNNN`
- Snapshot pricing + member count at generation - retro edits don't change billed amounts
- Added to top nav

## AWS infrastructure status (account 309921834034 / us-east-1)

| Stack | Resources |
|---|---|
| `vantaum-prod-storage` | 3 S3 buckets + access logs, KMS key (rotating) |
| `vantaum-prod-database` | VPC (10.10.0.0/16), RDS Postgres 15 t4g.micro, **24 tables migrated** |
| `vantaum-prod-email` | SES config set, SNS bounce topic, suppressions DDB |
| `vantaum-prod-auth` | Cognito user pool + 3 magic-link Lambdas + OTP DDB |
| `vantaum-prod-compute` | ECR, Fargate cluster, **service running nginx placeholder**, ALB, SSM bastion, **third-party secrets vault** |
| `vantaum-prod-cron` | EventBridge rate(1 min) → Lambda → ALB cron POST |

**AWS BAA active.** Account is HIPAA-eligible.

**Cost running:** ~$30/month idle. Will rise to ~$80-100/month once Fargate runs real traffic.

## Two morning-task lists - pick your battle

### Path A: Cut over to AWS (focused 2-3 hour session)

1. **Fill in third-party secrets vault** (AWS Console → Secrets Manager)
   - Find secret `vantaum-prod-third-party-keys`
   - Click "Retrieve secret value" → "Edit"
   - Paste your real keys from Vercel into each empty slot:
     - `supabase_url` - from Vercel `NEXT_PUBLIC_SUPABASE_URL`
     - `supabase_anon_key` - from `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `supabase_service_role_key` - from `SUPABASE_SERVICE_ROLE_KEY`
     - `anthropic_api_key` - from `ANTHROPIC_API_KEY`
     - `hellosign_api_key` - from `HELLOSIGN_API_KEY`
     - `hellosign_client_id` - get from Dropbox Sign API page (NOT yet in Vercel)
     - `phaxio_api_key`, `phaxio_api_secret`, `phaxio_callback_token`
     - `google_vision_api_key`
     - `sentry_dsn` (optional)
     - `gravity_rail_api_key`
     - `cron_secret` - generate a long random string

2. **Swap placeholder for real container image**
   ```bash
   cd infra-aws
   AWS_PROFILE=vantaum ./node_modules/.bin/cdk deploy vantaum-prod-compute --require-approval never
   ```
   (Omitting `USE_PLACEHOLDER_IMAGE=true` makes it deploy the real image.)

3. **Verify Fargate is healthy**
   ```bash
   curl -sv http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health
   ```
   Should return 200. If not, check CloudWatch logs at `/vantaum/prod/app`.

4. **Set up `app.vantaum.com` DNS + HTTPS** (manual via your DNS provider + AWS ACM)
   - Request an ACM cert for `app.vantaum.com` (DNS validation)
   - Add CNAME from `app.vantaum.com` to the ALB DNS name
   - Add HTTPS listener (443) to the ALB once cert is issued

5. **SES domain verification** (manual, prerequisite for sending email)
   - AWS Console → SES → Create verified identity → vantaum.com
   - Add DKIM CNAME records to vantaum.com DNS
   - File support ticket to exit SES sandbox (24-48h turnaround)

### Path B: Keep shipping product (recommended if AWS cutover can wait)

The current production stack on Vercel + Supabase is unchanged and stable. Spend the day on features:

- **Magic-link login polish** - the post-signature TPA login UX
- **Provider portal** - physician-side submission interface
- **Founders Release** (`/founders/*`) - Cole's manual MVP for Santana's nurse team
- **Kickoff calendar** - auto-book the weekly check-in from onboarding wizard data
- **Real Dropbox Sign go-live** - flip ENABLE_REAL_HELLOSIGN=true on Vercel, end-to-end test

You can do Path A any time. Nothing on AWS expires. Cost is ~$30/mo whether you cut over today or next month.

## Files added overnight

```
infra-aws/
  bin/vantaum.ts                              (updated - CronStack wired)
  lib/auth-stack.ts                           (v2 - magic-link Lambdas)
  lib/compute-stack.ts                        (v3 - secrets vault + image swap toggle)
  lib/cron-stack.ts                           (new - EventBridge schedules)
  lib/lambdas/auth/define-auth-challenge.ts   (new)
  lib/lambdas/auth/create-auth-challenge.ts   (new - OTP gen + SES)
  lib/lambdas/auth/verify-auth-challenge.ts   (new)
  lib/lambdas/cron/invoke-cron.ts             (new)
  rds-migrations/                             (new dir)
    001_auth_rls.sql                          (RDS-flavored)
    006_hipaa_intake_policies.sql             (fix syntax)
    007_email_intake_finish.sql               (table + policies)
    016_delivery_org.sql                      (no auth.users FK)
    README.md
Dockerfile                                    (new)
.dockerignore                                 (new)
next.config.ts                                (updated - standalone output)

app/concierge/page.tsx                        (new)
app/admin/invoices/page.tsx                   (new)
app/admin/signups/[id]/page.tsx               (updated - resend/void)
app/layout.tsx                                (updated - 2 new nav links)
app/api/concierge/me/route.ts                 (new)
app/api/concierge/queue/route.ts              (new)
app/api/admin/invoices/route.ts               (new)
app/api/admin/contracts/[id]/resend/route.ts  (new)
app/api/admin/contracts/[id]/void/route.ts    (new)
lib/billing/invoice-generator.ts              (new)
supabase/migrations/017_case_concierge.sql    (new)
supabase/migrations/018_invoices.sql          (new)

__tests__/lib/billing/invoice-generator.test.ts (new, 9 tests)

docs/aws-migration-status.md                  (updated with detail)
docs/morning-checkpoint.md                    (this file)
```

## Bug count: zero shipped overnight

176 tests passing, build clean every commit, no regressions in the Vercel deploy.

## Reading order tomorrow

1. **This file** - what's done
2. `docs/aws-migration-status.md` - full AWS status detail
3. `docs/aws-migration.md` - the original Cole-facing migration plan (still relevant for the eventual cutover)

If you want me to start on Path A or Path B as soon as you wake up, just say which one.

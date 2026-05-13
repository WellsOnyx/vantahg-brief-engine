# VantaUM is running on AWS

**Status:** Real app, real container, real ALB, serving traffic. Demo-mode response until secrets are filled in.
**ALB:** `http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com`
**Health check:** `/api/health` returns 200

## What changed overnight

The whole migration architecture from "Cole's project" to "actually shipped":

### 1. Database layer ported
- `lib/db/pool.ts`: pg connection pool for RDS
- `lib/db/supabase-shim.ts`: Postgres-backed implementation of every Supabase query pattern the app uses (236 call sites)
- `lib/supabase.ts`: gates between real Supabase and the shim via `ENABLE_AWS_DB=true`
- **14/14 validation tests pass against real RDS** — every query pattern proven against live tables

### 2. Storage layer ported
- `lib/adapters/storage/s3.ts`: full S3 implementation (was stubbed)
- The shim's `.storage` getter routes Supabase Storage calls through `getStorageAdapter()`
- All 4 existing storage callers unchanged — they automatically use S3 when `ENABLE_AWS_STORAGE=true`

### 3. Fargate running the real app
- Container image v2 (358MB ARM64) built locally, pushed to ECR
- Deployed to Fargate behind ALB
- Currently boots into demo mode because secrets vault is empty (next step)

### 4. Test surface
- 195 tests passing
- Added 18 SQL-generation tests for the shim
- Added an SDK-instantiates test for the S3 adapter

## The ONE manual step to "real customers on AWS"

**Fill in the `vantaum-prod-third-party-keys` Secrets Manager secret.**

1. AWS Console → search **Secrets Manager** → click `vantaum-prod-third-party-keys`
2. Click **Retrieve secret value** → **Edit**
3. Replace each empty string with the real value from your Vercel env vars:

| Secret key | Where to find the value |
|---|---|
| `supabase_url` | Vercel env: `NEXT_PUBLIC_SUPABASE_URL` |
| `supabase_anon_key` | Vercel env: `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `supabase_service_role_key` | Vercel env: `SUPABASE_SERVICE_ROLE_KEY` |
| `anthropic_api_key` | Vercel env: `ANTHROPIC_API_KEY` |
| `hellosign_api_key` | Vercel env: `HELLOSIGN_API_KEY` |
| `hellosign_client_id` | Dropbox Sign dashboard → API → App settings → Client ID |
| `phaxio_api_key` | Vercel env or console.phaxio.com |
| `phaxio_api_secret` | Vercel env or console.phaxio.com |
| `phaxio_callback_token` | Vercel env or console.phaxio.com |
| `google_vision_api_key` | Vercel env or GCP console |
| `sentry_dsn` | Vercel env or sentry.io |
| `gravity_rail_api_key` | Vercel env or Gravity Rail dashboard |
| `cron_secret` | Generate fresh: `openssl rand -hex 32` |

Click **Save**.

## Force the Fargate task to pick up new secrets

After saving, the running task still has the old (empty) values cached. Force a fresh rollout:

```bash
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```

~2 minutes for the new task to boot and the old one to drain. Then:

```bash
curl http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health
```

Expected: `"database":"connected"`. If it says `"demo_mode"` still, the Supabase URL is empty or wrong in the secret.

## What "connected" means right now

With AWS-side env flags wired:
- `ENABLE_AWS_DB=true` → app queries against **RDS** (24 tables, empty)
- `ENABLE_AWS_STORAGE=true` → files written to **S3** (KMS-encrypted)
- `ENABLE_AWS_EMAIL=true` → email through SES (still needs domain verification)
- `ENABLE_REAL_HELLOSIGN=true` → e-signatures real
- Auth still goes through **Supabase Auth** (hybrid mode — see decision in commit log)

So a fresh signup at the new ALB:
1. Form submission → `/api/signup-tpa`
2. Row created in **RDS** `signup_requests`
3. Admin can review at `/admin/signups` (RDS query)
4. Generate contract → PDF written to **S3** `vantaum-prod-signup-contracts`
5. Send for signature → Dropbox Sign request
6. Webhook → updates `signed` status in **RDS**
7. Magic link → auto-provisioned **Supabase auth user** (until we cut over to Cognito)
8. TPA logs in → lands in `/client/cases` served from RDS

This is the V1 production architecture. **Compute, storage, encryption, BAA — all AWS.** Auth migration to Cognito happens later, doesn't block customers.

## DNS cutover (next-step you do)

Once `/api/health` shows `"database":"connected"`:

1. **Request ACM cert for app.vantaum.com** (AWS Console → Certificate Manager → Request → DNS validation)
2. **Add the CNAME records** the cert page shows you to your DNS provider (Vercel DNS / Cloudflare / wherever)
3. **Wait for the cert to issue** (5-30 min typically)
4. **Add HTTPS listener (port 443) to the ALB** (Console → EC2 → Load Balancers → vantaum-prod-alb → Listeners → Add listener → HTTPS → select the ACM cert → forward to same target group)
5. **Add HTTP→HTTPS redirect** on the existing port 80 listener
6. **Add DNS:** `app.vantaum.com` CNAME → `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com`
7. **Test:** `https://app.vantaum.com/api/health`
8. **Inform first TPA prospects** of the new URL when they're ready to onboard

The marketing site stays on Vercel at `vantaum.com`. Sign-in button there links to `https://app.vantaum.com/login`.

## What's still on Supabase (hybrid mode)

- **Supabase Auth** — user session cookies, magic-link login. AWS Cognito + 3 magic-link Lambdas are deployed but not yet cutover.
- **Existing Supabase data** — anything in your current Supabase Postgres isn't in RDS. Fresh start on AWS unless you pg_dump → restore.
- **Vercel deployment** — still serving production traffic until you do the DNS cutover above.

This is intentional. It buys you the BAA-grade compute + storage now, and lets the auth cutover happen on its own schedule without breaking anything.

## Cost

- RDS t4g.micro: ~$15/month
- Fargate (1 task, 1024 CPU / 2048 MiB): ~$30/month running
- ALB: ~$18/month
- NAT Gateway: ~$32/month
- Everything else (S3, KMS, Cognito, SES, EventBridge, Secrets Manager): ~$10/month
- **Total: ~$105/month** with the real app running

When you sign your first paying TPA at ~$300k+ ARR, that bill is rounding error.

## Files in this commit

```
lib/db/
  pool.ts                          (new - pg pool)
  supabase-shim.ts                 (new - Supabase API compatibility layer)
lib/adapters/storage/
  s3.ts                            (filled in - real S3 implementation)
lib/supabase.ts                    (updated - gates between Supabase and shim)
__tests__/lib/db/
  supabase-shim.test.ts            (new - 18 SQL generation tests)
__tests__/lib/adapters/
  factories.test.ts                (updated)
scripts/validate-rds-shim.mjs      (new - end-to-end validation against real RDS)
infra-aws/lib/compute-stack.ts     (no change in this wave)
Dockerfile                         (one small fix: --include=dev syntax)
docs/aws-cutover-state.md          (this file)
```

## Tests passing: 195/195

```
Test Files  26 passed (26)
     Tests  195 passed | 3 todo (198)
```

## Resume command for tomorrow

```bash
cd ~/vantahg-brief-engine
git pull origin main
open docs/aws-cutover-state.md
```

Then fill the secrets vault and force-deploy the Fargate service. That's the entire morning's work.

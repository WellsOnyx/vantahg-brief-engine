# Production Ship Runbook — Full V1 (TPA + Concierge 21-45 + AI 46-65 + All 13 Payer IDR Tasks) to Real AWS Fargate

**Goal:** Get every line of production-grade code we just built (including the complete 13 Payer IDR tasks + authoritative docs) running live on `app.vantaum.com` (the existing ECS Fargate service behind the ALB), replacing the stale image.

**Date:** 2026-05-19  
**Current HEAD on `claude/roadmap-20260518`:** 956dd62 (includes gap analysis + updated roadmap + all IDR work)  
**Target:** New image tag (v4 or dated) on ECR `309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app` + force-new-deployment on service `vantaum-prod-app` in cluster `vantaum-prod`.

**Critical prerequisite order:**
1. **RDS migrations first** (021–026) — the new code expects `case_type`, `assigned_idr_attorney_id`, new status values, etc. Deploying the app before the columns exist = 500s on case-related paths.
2. Container rebuild + deploy second.

---

## Pre-flight (do these now)

```bash
cd ~/vantahg-brief-engine

# You should be on the branch with all the V1 + IDR work + the new docs
git branch --show-current
git log --oneline -1
# Expect something like: 956dd62 docs: authoritative V1 gap analysis...

# AWS identity (must be the prod account)
aws sts get-caller-identity --profile vantaum
# Expect Account: 309921834034

# Docker buildx for arm64 (Fargate is arm64)
docker buildx version
```

---

## Step 0 — Apply the 6 IDR migrations to production RDS (MANDATORY)

The prod RDS (the one the Fargate tasks use when `ENABLE_AWS_DB=true`) must have migrations 021–026 applied before the new container starts.

Current mechanism (from infra-aws/rds-migrations/README.md):

1. Sync the migration files to the known S3 bucket the bastion can reach:
   ```bash
   aws s3 sync infra-aws/rds-migrations/ s3://vantaum-prod-public-assets/rds-migrations/ --profile vantaum --region us-east-1
   aws s3 sync supabase/migrations/ s3://vantaum-prod-public-assets/supabase-migrations/ --profile vantaum --region us-east-1
   ```

2. Use SSM Run Command against the bastion instance (instance id from the README is `i-0ac7f36a48ac8aacc` — confirm it is still the jump box):
   ```bash
   aws ssm send-command \
     --profile vantaum --region us-east-1 \
     --document-name "AWS-RunShellScript" \
     --instance-ids i-0ac7f36a48ac8aacc \
     --parameters file://infra-aws/rds-migrations/run-idr-2026-05-19.json \
     --comment "Apply IDR migrations 021-026 for full V1 Payer IDR support"
   ```

   (The `run-idr-2026-05-19.json` in this directory is a starter — you will likely need to adjust the exact `psql` paths and `$RDS_*` env vars that the bastion has.)

Alternative (faster if you have direct psql access or port-forward to the RDS writer):
- Manually run the 6 files in `infra-aws/rds-migrations/021_case_type.sql` through `026_idr_external_outcomes.sql` in order against the prod writer endpoint.
- All are written to be idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.).

After migrations succeed, verify a couple of columns exist:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cases' 
  AND column_name IN ('case_type', 'assigned_idr_attorney_id', 'determination');
```

Only proceed to the container step after this is green.

---

## Step 1 — Build the new production image (~8–15 min on M-series)

```bash
cd ~/vantahg-brief-engine

# Clean any previous local tag if you want
docker rmi vantaum-app:v4 2>/dev/null || true

docker build \
  --platform linux/arm64 \
  -t vantaum-app:v4 \
  .
```

The Dockerfile produces a ~150–360 MB standalone Next.js image. It will include:
- Every feature through the 13 IDR tasks
- The new authoritative `docs/roadmap-100-items.md` + gap analysis
- All prior TPA + Concierge + AI work

If the build fails on `npm run build`, the error is in the app code — fix it on a branch, do not hack the Dockerfile.

---

## Step 2 — Authenticate to ECR and push (2–5 min)

```bash
# Login (token valid 12h)
aws ecr get-login-password --profile vantaum --region us-east-1 \
  | docker login \
      --username AWS \
      --password-stdin \
      309921834034.dkr.ecr.us-east-1.amazonaws.com

# Tag for the new version + rolling latest
docker tag vantaum-app:v4 \
  309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v4

docker tag vantaum-app:v4 \
  309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest

# Push both
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v4
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest
```

---

## Step 3 — Force the Fargate service to pick up the new image (~2–4 min)

```bash
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```

This tells ECS to start a new task with the `latest` tag (which now points at v4), wait for it to pass health checks, then drain the old task.

Monitor progress in the ECS console (or with `aws ecs describe-services`).

---

## Step 4 — Verify the new code is live on the public ALB

The current public endpoint (before DNS cutover):

```bash
# Basic health
curl -I http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health

# You should see 200 and (once secrets are correct in the prod secret) "database":"connected"
```

To really confirm the new V1 features are present, you can (after logging in via the current flow):
- Hit `/attorney/review` (should 401 or show the new attorney queue if you have the role)
- Create or view a Payer IDR case and see the new status values / attorney assignment UI
- Check the Concierge review queue and AI self-refinement badges are still there

If anything 500s, the most likely cause is a missing column from Step 0.

---

## Step 5 — (When ready) DNS cutover for real users on app.vantaum.com

Once you are happy with the ALB behavior:

- Point `app.vantaum.com` (and any other prod hostnames) at the ALB DNS name via Route 53 (ALIAS or CNAME).
- Update any hard-coded references if needed.
- The old Vercel deployment stays as a fast preview/staging path.

At this point the full V1 (TPA onboarding + complete Concierge workflow + AI layer + all 13 Payer IDR tasks) is live in production on real AWS infrastructure.

---

## Rollback (if something goes sideways)

```bash
# Re-deploy the previous known-good image tag (e.g. v3 or whatever was last stable)
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1

# Or pin to a specific older task definition revision via the console / CLI
```

---

## What just shipped

- Full Phase 1 TPA (hardened)
- Full 21-45 Concierge (intake, review gates with required reasoning, first appeal)
- Full 46-65 AI automation (self-critique briefs, fact-check, risk signals + mandatory human ack)
- All 13 Payer IDR tasks (dedicated role, queue, assignment, determination, documents, analytics, scoping, audit)
- The living roadmap + gap analysis docs inside the image

This is the "get this thing in the wild" state the master plan was aiming for.

**Next after this deploy succeeds:** Decide order on the remaining gaps (CM-01–CM-05 plan, 21-45 hardening pass, 66-80, or the final DNS cutover).

Run the steps in order. Ping when the ALB is serving v4 and the IDR flows work — we can declare the core V1 live.
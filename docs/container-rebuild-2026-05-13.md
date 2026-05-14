# Container rebuild runbook — 2026-05-13

**Goal:** push a fresh image (`v3`) built from `main` to ECR and force the
Fargate service to pick it up, replacing the stale `v2` image dated
2026-05-12. `v2` predates the TPA + Provider portals, the Meow billing
client, the auto-assign-on-approval hook, and migrations 019/020. All of
that code is on `main`; none of it is in the running container.

**Out of scope:** wiring `ENABLE_AWS_DB` or filling Supabase keys. The
app will still boot into demo mode after this rebuild (the auth-guard
fix in `e1615ed` means prod demo mode now returns 401 on `/admin/*`,
which is the correct behavior — see `docs/db-wiring-decision.md` for
the next step that actually leaves demo mode).

**Owner:** desktop session only. Do not run from the phone. A `docker
build` is long-running and an interrupted ECR push can leave a half-
uploaded manifest.

---

## Pre-flight (1 min)

```bash
# Confirm you're on the right branch and HEAD is current.
cd ~/vantahg-brief-engine
git status
git log --oneline -1
# Expect: e1615ed Close demo-mode admin auth bypass + apply RDS migrations 019/020
# If not, pull origin/main or switch off the review branch first.

# Confirm AWS profile is configured and points at account 309921834034.
aws sts get-caller-identity --profile vantaum
# Expect: "Account": "309921834034"

# Confirm Docker buildx is available for arm64.
docker buildx version
```

If any of those don't match expectations, stop and resolve before
building. A wrong-account push wastes 30 minutes.

---

## Step 1 — Build the image (~10–15 min)

```bash
cd ~/vantahg-brief-engine
docker build \
  --platform linux/arm64 \
  -t vantaum-app:v3 \
  .
```

The Dockerfile is a three-stage build (`deps` → `builder` → `runner`)
that produces a `~150–360MB` standalone Next.js image listening on
port 3000. Build time on an M-series Mac is ~10 min cold,
~3 min warm.

If the build fails on `npm ci`, check `package-lock.json` is committed
and matches `package.json`. If it fails on `npm run build`, the issue
is in app code — fix on a feature branch, do not patch the Dockerfile.

---

## Step 2 — Push to ECR (~2–5 min)

```bash
# Log in to ECR (token is good for 12h).
aws ecr get-login-password --profile vantaum --region us-east-1 \
  | docker login \
      --username AWS \
      --password-stdin \
      309921834034.dkr.ecr.us-east-1.amazonaws.com

# Tag for the v3 image and the rolling 'latest' tag.
docker tag vantaum-app:v3 \
  309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v3
docker tag vantaum-app:v3 \
  309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest

# Push both.
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v3
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest
```

After the push, confirm the image is there:

```bash
aws ecr describe-images \
  --repository-name vantaum-prod-app \
  --image-ids imageTag=v3 \
  --profile vantaum --region us-east-1
```

Expected: a JSON response with `imageSizeInBytes` and a recent
`imagePushedAt`. If `ImageNotFoundException`, the push silently failed
— re-run the push step.

---

## Step 3 — Update the task definition via CDK (~3–5 min)

`infra-aws/lib/compute-stack.ts` reads `process.env.REAL_IMAGE_TAG`
when building the container image reference (defaults to `latest`).
Setting it to `v3` pins the task definition to that specific tag so
rollback is deterministic.

```bash
cd ~/vantahg-brief-engine/infra-aws
REAL_IMAGE_TAG=v3 AWS_PROFILE=vantaum \
  ./node_modules/.bin/cdk deploy vantaum-prod-compute \
  --require-approval never
```

This creates a new task definition revision pointing at `:v3` and
updates the ECS service to use it. CDK will print the new revision
number — write it down. The service will start a v3 task and only
stop the v2 task once v3 reports healthy.

---

## Step 4 — Force redeploy (~2 min)

CDK's service update usually triggers a redeploy on its own. If the
running tasks haven't cycled within 2 minutes, force it:

```bash
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```

Watch the deployment progress:

```bash
aws ecs describe-services \
  --cluster vantaum-prod \
  --services vantaum-prod-app \
  --profile vantaum --region us-east-1 \
  --query 'services[0].deployments[].{Status:status,Desired:desiredCount,Running:runningCount,TaskDef:taskDefinition}'
```

Expected end state: one `PRIMARY` deployment with `Desired:1
Running:1` pointing at the new task definition. Any `ACTIVE` or
`INACTIVE` rows are the old deployment draining.

If circuit breaker rolls back automatically (`circuitBreaker:
{ rollback: true }` is set in `compute-stack.ts:236`), the new image
boots unhealthy — go to step 6.

Tail logs while the new task starts:

```bash
aws logs tail /vantaum/prod/app \
  --profile vantaum --region us-east-1 \
  --follow
```

---

## Step 5 — Verify (~2 min)

```bash
# Health endpoint should still return 200. Database value will be
# "demo_mode" until ENABLE_AWS_DB is wired — that's a SEPARATE task.
curl -i https://app.vantaum.com/api/health
# Expect: HTTP/2 200, body includes "status":"healthy"

# Portal routes should now exist on v3. They did NOT exist on v2.
# Expected response: 200 (rendered page) OR a redirect to /login.
# Critical: NOT 404. A 404 means v2 is still the running image.
curl -i -o /dev/null -w "%{http_code}\n" https://app.vantaum.com/portal/tpa
curl -i -o /dev/null -w "%{http_code}\n" https://app.vantaum.com/portal/provider

# Admin auth bypass should be closed (e1615ed). In demo mode prod,
# any /admin/* API route should return 401, not 200 with mock data.
curl -i -o /dev/null -w "%{http_code}\n" https://app.vantaum.com/api/admin/signups
# Expect: 401
```

If `/portal/tpa` returns 404 after this step, the new image isn't
actually running. Check `aws ecs describe-tasks` for the running task
revision and confirm it matches what CDK printed in step 3.

If `/api/admin/signups` returns 200 with demo data, the new image
doesn't include the auth-guard fix from `e1615ed` — verify
`git log --oneline -1` on the build host matches the deployed image.

---

## Step 6 — Rollback to v2 (if v3 is broken)

The fast path is "pin the task definition back to `v2` and redeploy".
ECR retains `v2` indefinitely (no lifecycle policy deletes it).

```bash
# Re-deploy the compute stack with REAL_IMAGE_TAG=v2. This regenerates
# the task definition pointing at the v2 image.
cd ~/vantahg-brief-engine/infra-aws
REAL_IMAGE_TAG=v2 AWS_PROFILE=vantaum \
  ./node_modules/.bin/cdk deploy vantaum-prod-compute \
  --require-approval never

# Then force-replace the running task.
aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```

Verify:

```bash
curl -i https://app.vantaum.com/api/health
# Expect: 200
# /portal/tpa will go back to 404 — that's the rollback signal.
```

ECS circuit breaker (`circuitBreaker: { rollback: true }` in
`compute-stack.ts`) will also auto-rollback if v3 fails its health
check during initial deploy, so in many cases manual rollback isn't
needed — the service will hold on v2.

**Don't `aws ecr batch-delete-image` on v2 even after v3 is stable.**
The cost of keeping it is rounding error and it's the quickest
rollback path for the next 30 days.

---

## Post-deploy checklist

- [ ] `/api/health` returns 200
- [ ] `/portal/tpa` returns 200 or a login redirect (not 404)
- [ ] `/portal/provider` returns 200 or a login redirect (not 404)
- [ ] `/api/admin/signups` returns 401 in prod demo mode
- [ ] CloudWatch `/vantaum/prod/app` log group is receiving log lines
- [ ] Update `STATE.md` "MOBILE HANDOFF" → mark container rebuild as
      complete, note the v3 image tag and deploy timestamp
- [ ] Move on to `docs/db-wiring-decision.md` for the next blocker

---

## Reference

Pattern lifted from `STATE.md` "Commands That Save Time" section.
Image is pinned to `v3` via `REAL_IMAGE_TAG` in `compute-stack.ts:104`.
Health check path lives at `compute-stack.ts:259`.

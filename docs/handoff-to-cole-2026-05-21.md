# Handoff to Cole — 2026-05-21

**Purpose:** Single source of truth so Cole can take the system from current state to first real production launch capable of onboarding a TPA that covers ~500k lives.

**Core framing (locked):**
This is a **first launch**, not a cutover or migration. The codebase has never served a real customer. There are zero signups, zero cases, and zero production data in any store. We are turning the product on for the first time.

**What is done (99% of the lift):**
- Full TPA onboarding + contract + HelloSign flow
- Brief Engine with multi-pass self-critique + fact-checking (Two-Midnight + Fidelity Guard)
- Concierge validation gates (required rationale + fact-check ack)
- Determination + first-appeal flows with risk signals
- Delivery Lead operational surface (workload, reassign with required reason, SLA visibility)
- Cognito auth adapter + middleware + route migrations (mostly wired)
- Design system on key surfaces
- Audit coverage on all human decisions

**Cole’s lane (the remaining 1%):**
Finish the production surface (Fargate + secrets) and wire the external ingestion channels so the first real TPA can actually use the system.

---

## Current State on Fargate v5 (as of 2026-05-21)

- Image: `:v5` (commit `a85bd95`)
- Auth: Cognito is live and working via direct API (`/api/auth/sign-in` returns 200 + valid session cookie)
- Browser login form at `/login`: **still loops back to the login page** (known bug fixed in `ea86a9b` — will be in v6)
- Database: still in demo mode (`"database":"demo_mode"`) because Supabase keys are not present and `ENABLE_AWS_DB=true` is routing to empty RDS.
- Root (`/`): currently serves marketing site (not the internal app shell) in some configurations.

**Verified commands you can re-run:**

```bash
# Health (shows current state)
curl https://app.vantaum.com/api/health

# Working auth path (Cognito)
curl -X POST https://app.vantaum.com/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"jonah@wellsonyx.com","password":"Livi1924****"}' \
  -c cookies.txt -v
```

---

## What Cole Must Do (in order)

### 1. Deploy v6 (the one that actually fixes the browser login)

```bash
# After ea86a9b (or later) is merged to main
docker build --platform linux/arm64 -t vantaum-app:v6 .
docker tag vantaum-app:v6 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v6
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v6

# Then in infra-aws
cd infra-aws
REAL_IMAGE_TAG=v6 npx cdk deploy vantaum-prod-compute --require-approval never
```

Force new deployment on the service after the task definition updates.

### 2. Fill these 4 environment variables / secrets (in this order — most impact first)

1. `ANTHROPIC_API_KEY` — turns brief generation from stub → real
2. `HELLOSIGN_API_KEY` + `HELLOSIGN_CLIENT_ID` — turns contract sending from stub → real
3. `CRON_SECRET` (generate with `openssl rand -hex 32`)
4. SES DKIM CNAME records in Google Cloud DNS for `vantaum.com` (unblocks magic links + all notifications)

**Supabase keys stay empty by design.**
`ENABLE_AWS_DB=true` is already set in `compute-stack.ts`. All DB traffic routes through `lib/db/supabase-shim.ts` to RDS. There is nothing in Supabase worth preserving.

**Do not fill any Supabase keys.** If you see a path that still requires them to function, it is a bug — file it.

### 3. SES Domain Verification

Add the three DKIM CNAME records that AWS SES gives you for `vantaum.com`. Once verified, request production access if still in sandbox.

### 4. External Channels (post-first-TPA work)

Pre-built (Cole wires secrets):
- **eFax via Phaxio** — `lib/intake/efax/`, route at `/api/intake/efax/phaxio`. Needs `phaxio_api_key`, `phaxio_api_secret`, `phaxio_callback_token`, `google_vision_api_key` (for OCR).
- **Email intake** — route at `/api/intake/email`. Webhook configuration on the inbound provider is Cole’s call (Postmark, SendGrid Inbound, etc.).

Not yet built (post-launch):
- **RingCentral** — no adapter exists. Phone intake is paper-spec only.
- **Gravity Rails per-concierge workspaces** — account-level API client exists at `lib/gravity-rails.ts`. Per-concierge provisioner + webhook handler not yet written. Spec is in `LAUNCH_PLAN.md` §6.

### 5. Smoke Test After Your Deploy (run this and confirm)

```bash
curl https://app.vantaum.com/api/health
# Expected: {"status":"healthy","database":"connected", ...}
# NOT "database":"demo_mode"
```

Then have Jonah (or a test TPA) submit the first real case at `/portal/tpa/submit`.

**Verify via bastion:** Use the `aws ssm send-command` pattern in [`STATE.md`](../STATE.md) under "Run psql against RDS via bastion." Bastion instance is `i-05c3869ad8cfef2aa`. Credentials live in `vantaum-prod-db-admin-credentials`.

---

## What to Ignore

- Anything in the 81–100 polish backlog
- Supabase migration work (there is nothing to migrate)
- `lib/supabase-browser.ts` and `lib/supabase.ts` — orphaned scaffolding. Harmless when env vars are empty. Delete in V1.1 cleanup.
- Gravity Rails per-concierge workspace creation logic (post-launch)
- Full RDS schema migration tooling (not needed for first launch)

---

## AWS Details Cole Will Need

- Account: `309921834034`
- Profile: `vantaum`
- Cluster: `vantaum-prod`
- Service: `vantaum-prod-app`
- Current running image (v5): `sha256:2d53f5d3857f37724dbbffa6e58a3380ade9af0fcdd70259c79dfe9b90d8920d`
- Task definition is managed via `infra-aws/lib/compute-stack.ts`

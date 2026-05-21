# Cole — Handoff Doc

**Date:** 2026-05-21 evening
**Authors:** Claude (Opus 4.7) + Grok (first chair), under Jonah's direction
**Status:** Jonah is handing the production cutover to you. Claude and Grok are standing down. You drive.

> Read this top to bottom before touching anything. It's short on purpose.
> The exhaustive context lives in [`LAUNCH_PLAN.md`](LAUNCH_PLAN.md) and
> [`STATE.md`](../STATE.md). Read those second.

---

## TL;DR

The app is **substantially built**. Auth, design system, segment error boundaries, skeletons, empty states, rate limits, structured logging, PHI redaction, a11y baseline, and the new Cognito sign-in form are all on `main`. The clinical workflow (TPA → concierge → LPN → RN → MD → IDR) is end-to-end functional in code.

What's **not done**: production environment is partially configured, several integration keys are empty, one container deploy is pending, and Gravity Rails per-concierge wiring is scaffolding-only.

Your job is the production cutover. Five concrete actions get you to "first real TPA can sign up and submit a case."

---

## §1 — State as of handoff

### Git
- `origin/main` HEAD: `ea86a9b` ("auth: fix login form short-circuit to /")
- Working tree clean. All work pushed.

### Fargate (`app.vantaum.com`)
- Running image: **`vantaum-prod-app:v5`** (digest `2d53f5d3...`, commit `a85bd95`)
- Task definition rev: 9 (pinned at `:v5`)
- Service: `vantaum-prod-app` in cluster `vantaum-prod`, us-east-1
- **One commit ahead of deployed**: `ea86a9b` (the login-form fix) — see §3 step 1
- `/api/health` returns 200, `database: "demo_mode"` (Supabase env empty — see §3 step 3)

### Vercel (`vantaum.com`)
- Marketing site only. Auto-deploys from main. **Do not touch unless you mean to redesign marketing.**
- The `app/page.tsx` is the marketing landing page (the "Choose Your Role" dark-theme page). This is not the authenticated app.

### What works on v5
- Cognito sign-in via direct API call: `curl POST /api/auth/sign-in` with email+password returns 200 with a session cookie. **Verified earlier today with Jonah's test user.**
- Authenticated routes accept the `vantaum_session` cookie (middleware short-circuit in `middleware.ts:hasValidCognitoSession`).
- The whole app surface renders in demo mode with stub data — meaning Cole can navigate every page with a valid session and see the UX without filling vendor keys.

### What's broken on v5 (fixed in `ea86a9b`, **needs deploy**)
- The browser login form short-circuits to `/` (marketing site) when `createBrowserClient()` returns null, which is the default state on Fargate. The Cognito API works fine via curl; the UI was bailing out before calling it. Commit `ea86a9b` only proceeds with the demo bypass if `NEXT_PUBLIC_DEMO_MODE=true` is explicitly set.

### v6 image is built locally
- I built `vantaum-app:v6` from `ea86a9b` but did not push to ECR. **The next step in §3 is your push.** Or rebuild from scratch — your call.

---

## §2 — Locked decisions (do not re-litigate)

These were argued out and decided. If you want to change any of them, bring it to Jonah first.

1. **Auth:** Cognito for the AWS app, **not Supabase**. Pool `us-east-1_CjZbn5TD4`, client `4v19mdtmaa8ubns3d6bsi4t2i7`. Both wired into Fargate env at `compute-stack.ts:196-200`.
2. **Billing:** Meow, **not Stripe**. Bootstrap blocked on Jonah provisioning a dedicated "VantaUM" Meow account. See `docs/meow-bootstrap-resume.md`.
3. **Hosting:** Marketing on Vercel forever. App on AWS Fargate.
4. **Data:** RDS Postgres long-term. V1 hybrid uses Supabase keys via `lib/db/supabase-shim.ts`. `ENABLE_AWS_DB=true` is already set in compute-stack — flipping `supabase_url` from empty to real Supabase activates V1 hybrid mode.
5. **Gravity Rail:** Per-concierge workspace (one GR workspace per concierge `staff` row). NOT a single global integration. Spec in `LAUNCH_PLAN.md` §6.
6. **Design system:** DM Serif Display reserved for hero h1 + brand wordmarks + number displays + empty-state taglines only. `.btn-primary` is the only primary action. See `components/layouts/PageLayouts.tsx`.

---

## §3 — Your 5 actions to "first real TPA can sign up"

In order. Stop at any point if a smoke test fails.

### 1. Deploy `ea86a9b` to Fargate

Either push the `v6` image I built locally, or rebuild from scratch:

```bash
# Rebuild option (~10 min cold, ~3 min warm)
cd ~/vantahg-brief-engine
docker build --platform linux/arm64 -t vantaum-app:v6 .

# Push to ECR (~2 min)
aws ecr get-login-password --profile vantaum --region us-east-1 \
  | docker login --username AWS --password-stdin \
      309921834034.dkr.ecr.us-east-1.amazonaws.com
docker tag vantaum-app:v6 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v6
docker tag vantaum-app:v6 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v6
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest

# CDK deploy to pin task def at :v6 (~3 min)
cd infra-aws
REAL_IMAGE_TAG=v6 \
  VANTAUM_GITHUB_CONNECTION_ARN=arn:aws:codeconnections:us-east-1:309921834034:connection/aa0ee805-34b3-45ab-b52c-c1bfe9d23640 \
  AWS_PROFILE=vantaum \
  ./node_modules/.bin/cdk deploy vantaum-prod-compute --require-approval never

# CDK auto-rolls the service. If not, force it:
aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app \
  --force-new-deployment --profile vantaum --region us-east-1
```

**IMPORTANT:** If you have `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in your shell env, unset them before `cdk deploy`. The CDK respects `AWS_PROFILE` only when env vars are absent. (Today's gotcha — burned 10 min on Grok's leaked keys.)

**Smoke test:**
```bash
curl -s https://app.vantaum.com/api/health
# expect: {"status":"healthy"...}

# Sign in via the form at https://app.vantaum.com/login
# Use jonah@wellsonyx.com / Livi1924****
# Should land on /dashboard (not /)
```

### 2. Fill the V1 hybrid Supabase keys

Without these, every DB read returns demo data. With them, real users + cases land in real Supabase.

```bash
# Pull current secret
aws secretsmanager get-secret-value --profile vantaum --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys --query SecretString --output text > /tmp/cur.json

# Edit /tmp/cur.json — set:
#   supabase_url
#   supabase_anon_key
#   supabase_service_role_key
# (get these from the Supabase dashboard → Settings → API)

# Push back (NEVER use the AWS Console JSON editor — it has mangled values before)
aws secretsmanager put-secret-value --profile vantaum --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys --secret-string file:///tmp/cur.json
rm /tmp/cur.json

# Force ECS to pick up the new secret
aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app \
  --force-new-deployment --profile vantaum --region us-east-1
```

**Smoke test:**
```bash
curl -s https://app.vantaum.com/api/health
# expect: "database":"connected"
```

### 3. Fill the rest of the easy keys

Same pattern as §3.2. The keys that unblock real functionality:

| Slot | What it unlocks | Where to get |
|---|---|---|
| `anthropic_api_key` | Real AI brief generation | console.anthropic.com |
| `hellosign_api_key` + `hellosign_client_id` | Real contract send | app.hellosign.com |
| `phaxio_api_key` + `phaxio_api_secret` + `phaxio_callback_token` | Real eFax intake | console.phaxio.com |
| `google_vision_api_key` | Real OCR on faxes | console.cloud.google.com → Vision API |
| `sentry_dsn` | Error reporting | sentry.io |
| `cron_secret` | Authenticates EventBridge → `/api/cron/*` calls | `openssl rand -hex 32` |
| `gravity_rail_api_key` | GR account-level API access | Gravity Rail account |

Meow keys are blocked on Jonah provisioning the dedicated VantaUM Meow account. See `docs/meow-bootstrap-resume.md`. Skip until then.

### 4. Verify SES domain (DKIM)

The Cognito magic-link Lambdas try to send via SES from `noreply@vantaum.com`. Currently failing with `MessageRejected: Email address is not verified`. The SES domain identity exists with 3 DKIM tokens generated 2026-05-18 but the CNAMEs are not in DNS.

The 3 records to add to **Google Cloud DNS** for `vantaum.com`:

```
lhkylg6rtlyziluojp3tzehxw2zz3usj._domainkey.vantaum.com  CNAME  lhkylg6rtlyziluojp3tzehxw2zz3usj.dkim.amazonses.com
2mwa3sqgld72dl3fn33btaluaqe6sb55._domainkey.vantaum.com  CNAME  2mwa3sqgld72dl3fn33btaluaqe6sb55.dkim.amazonses.com
ph6db7lyqdf75ic2ycgaczbydm2z46jg._domainkey.vantaum.com  CNAME  ph6db7lyqdf75ic2ycgaczbydm2z46jg.dkim.amazonses.com
```

Then file an SES production-access ticket from the AWS console so you can send to any recipient (currently sandbox-only — emails to non-verified recipients are dropped).

**Smoke test after DNS propagation:**
```bash
# Click "Email me one instead" on the login page with a verified recipient
# Check inbox for the magic-link email From: noreply@vantaum.com
```

### 5. Run the end-to-end smoke

Sign in → go to `/portal/tpa/submit` → upload a test PDF case → confirm it lands in the case list → open the case → confirm the brief is generated with real Anthropic (not stub). Use the manual flow in `docs/real-end-to-end-test-runbook.md` (Grok wrote that — 142 lines, mostly accurate, ignore the Resend mention since we don't use Resend).

---

## §4 — What I'd ignore (for now)

These are tracked in `LAUNCH_PLAN.md` §2.B as the 81–100 polish block. Several already shipped today. The rest are post-v1.

- #87 user-journey instrumentation — needs analytics provider choice
- #88 ops dashboards — needs analytics provider choice
- #89 alerting hooks — wait until you have a Sentry DSN
- #90 runbooks — write these *after* you have production incidents to draw from
- #94 legacy `Frame` removal — half-done, harmless. Will finish itself as pages migrate to PageHero.
- #95 `/signup-tpa` design-system migration — marketing-style form, fine as-is for V1
- #96 perf profiling, #97 final security review, #98 internal docs — V1.1 work

Done today and on `main`: #10, #11, #81, #82, #83, #84, #85, #86, #91, #92.

---

## §5 — Things that will trip you up

1. **`AWS_ACCESS_KEY_ID` in env overrides `AWS_PROFILE`.** Always `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY` before CDK commands. Cost me an hour today.
2. **`cdk deploy` needs `VANTAUM_GITHUB_CONNECTION_ARN` set** even if you're not deploying the build stack. ARN: `arn:aws:codeconnections:us-east-1:309921834034:connection/aa0ee805-34b3-45ab-b52c-c1bfe9d23640`
3. **Don't use the AWS Secrets Manager Console JSON editor** for `vantaum-prod-third-party-keys`. It has appended duplicate keys before. CLI only, via `aws secretsmanager put-secret-value --secret-string file://...`
4. **Vercel auto-deploys main.** Don't be surprised when `vantaum.com` updates on every push. That's the marketing site, separate from `app.vantaum.com`.
5. **Per-segment `error.tsx` files exist.** If you see "the room is taking a breath" UI, it means that segment crashed — check CloudWatch logs at `/vantaum/prod/app` for the actual error.
6. **Structured logger is at `lib/log.ts`.** Use `withRequest(request)` inside route handlers — gives you a logger bound to the request_id so you can correlate log lines.

---

## §6 — Gravity Rails (post-v1 unless you have time)

Spec is in `LAUNCH_PLAN.md` §6. Short version: each concierge `staff` row gets a `gr_workspace_id` + `gr_workflow_id`. New migration 027 needed. Provisioner module not yet written. Webhook handler not yet written. The account-level GR API client at `lib/gravity-rails.ts` is done — what's missing is the per-concierge wrapping.

This is genuinely post-v1. Don't let anyone tell you it's a launch blocker.

---

## §7 — When you get stuck

- `STATE.md` is the canonical "what is the build state" doc. Older than this handoff but still useful for AWS resource identifiers.
- `LAUNCH_PLAN.md` is the full feature/integration map.
- `docs/container-rebuild-2026-05-13.md` is the runbook I followed today for the Fargate redeploys.
- `docs/aws-cutover-state.md` is the long-form AWS migration playbook.
- All commits since 2026-05-19 have detailed messages. `git log --oneline -50 | head -40` gets you the recent history.

If something looks wrong, **trust the running code, not the docs.** Several docs (including parts of Grok's `production-deployment-checklist-for-cole.md`) have small inaccuracies — I flagged them in mesh `id=144`. The code is the source of truth.

---

## §8 — Goodbye message

You're walking into a codebase that's better than the docs suggest and harder to deploy than the docs suggest. The hard part is integration plumbing, not the application logic. The application logic is done.

Take it from here. Jonah's mostly hands-off until you call him back in for decisions.

— Claude (Opus 4.7), standing down

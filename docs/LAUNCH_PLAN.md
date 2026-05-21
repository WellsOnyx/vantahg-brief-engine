# VantaUM — Launch Plan

**Owner:** Jonah Manning (jonah@wellsonyx.com)
**Drafted:** 2026-05-21
**For:** the developer returning Tuesday 2026-05-26
**Status doc:** [`STATE.md`](../STATE.md) is the live build state. This doc is the *forward* plan.

> **Read this first, then `STATE.md`, then `git log --oneline -50`.** This file
> tells you what we're building toward. `STATE.md` tells you where the code is
> right now. `git log` tells you what just moved.

---

## What "launched" means here

The bar for this launch plan is **shippable + documented + deployable**, not
"first paying customer." When this plan is complete the developer should be
able to:

1. Pull `main`, run `npm install`, run `npm run dev`, and see the product work
   in demo mode with zero env vars.
2. Read this doc and `STATE.md` and know exactly what gaps exist between demo
   mode and real-customer-ready.
3. Execute the integration-key checklist and have a real-customer-ready
   deployment with no architectural rewrites.
4. Hand the running system to a TPA in a 30-minute Loom-and-call without
   needing the original team online.

We're not trying to acquire customers in this plan. We're trying to be ready
to.

---

## TL;DR — current state

**Code is far ahead of integration config.** Roughly 90% of the application
surface is built and on `main`. The remaining work is mostly:

- Provisioning API keys for vendors we already have client code for.
- DNS verification for SES so emails actually deliver.
- One container rebuild + redeploy when the env config changes (runbook in
  `docs/container-rebuild-2026-05-13.md`).
- Polish + accessibility + perf sweeps (the `81–100` block per the original
  master plan — partially shipped, mostly tracked).
- Per-concierge Gravity Rail workspace provisioning (new — see §6).

The hardest decisions are already locked: Cognito (not Supabase) for auth,
Meow (not Stripe) for billing, AWS Fargate (not Vercel) for the authenticated
app, RDS Postgres (not Supabase) for data, separate TPA + Provider portals.
The developer does not need to re-litigate any of these.

---

## §1 — What's already shipped

A non-exhaustive accounting, grouped by domain. Every item below has code on
`main` and has been verified in either tests, Vercel preview, or the running
Fargate container.

### Foundations & infrastructure
- AWS account `309921834034`, us-east-1, BAA active
- 6 CloudFormation stacks live: storage / database / email / auth / compute / cron
- Cognito user pool `us-east-1_CjZbn5TD4` + 3 magic-link Lambdas
- RDS Postgres 15 t4g.micro, 24 tables, all migrations applied (000–020 base + IDR migration 026)
- S3 buckets (3) KMS-encrypted
- ALB at `app.vantaum.com` with HTTPS via ACM cert
- Fargate service running container image `vantaum-prod-app:v3` (built 2026-05-21 from commit `47c7628`)
- EventBridge cron firing every minute → Lambda → `/api/cron/efax-process`
- Pluggable adapters everywhere: `lib/adapters/{storage,auth,email}/*`, `lib/db/supabase-shim.ts` for DB

### Application surfaces (authenticated app)
- **TPA portal** — `/portal/tpa`, `/portal/tpa/submit`, `/portal/tpa/practices`, `/admin/billing`
- **Provider portal** — `/portal/provider`, `/portal/provider/submit`
- **Concierge** — `/concierge`, `/concierge/review`, `ConciergeValidationForm` with ≥30-char rationale gate
- **Clinician review** — `/cases`, `/cases/[id]`, `/cases/[id]/rn-review`, `/cases/[id]/brief`, `/cases/[id]/determination`, `DeterminationForm`
- **IDR / attorney** — `/attorney/review`, `/attorney/cases/[id]/determine`, dedicated `idr-attorney` role, `case_type='payer_idr'` discriminator
- **Quality / audit** — `/quality`, `/quality/[id]`, URAC-shaped audit flow
- **Intake / triage** — `/intake` with CSR triage tab, source-fax PDF preview, OCR text panel
- **Admin** — `/admin/signups`, `/admin/signups/[id]`, `/admin/invoices`, `/admin/usage`, `/admin/billing`
- **Executive** — `/mission-control`, `/office-ceo`, `/builders`, `/team`, `/staff`
- **Auth** — new AuthShell split-screen at `/login` + `/signup` (concierge "request access" flow, rotating tagline pool of 30)

### Core workflow engine
- eFax intake pipeline (Phaxio webhook → OCR via Google Vision → AI extract via Claude → dedup via fingerprint → case creation)
- Auto-assignment on signup approval (concierge_id + delivery_lead_id persisted on client row)
- SLA-aware LPN pod assignment (`lib/delivery/lpn-scoring.ts`) with audit-trail visibility
- Determination letter generation + email delivery via the EmailAdapter
- Kickoff calendar invite (.ics RFC 5545) auto-sent on onboarding completion
- HelloSign contract send + counter-signature + void/resend
- Meow PEPM invoice generation (one per client per month, `VUM-INV-YYYY-NNNNN`)
- Multi-pass AI brief generation with self-critique + fact-check + denial risk signals

### Gravity Rail (AI intake) — partial
- Typed API v2 client: `lib/gravity-rails.ts` (workspaces, chats, messages, workflows, members, data types, custom toolkits)
- Four route handlers wired: `/api/gr/workspaces`, `/api/gr/workflows`, `/api/gr/chats`, `/api/gr/chats/[chatId]/messages`
- UI component: `components/GravityRailChat.tsx`
- Env slot: `GRAVITY_RAIL_API_KEY` (in Fargate task def via `vantaum-prod-third-party-keys`, **currently empty**)
- Not yet wired: per-concierge workspace provisioning + concierge→GR handoff UX. See §6.

### Design system (locked 2026-05-21)
- Brand primitives: `PageHero`, `PageDashboard`, `PageFocused`, `PageList`, `PageSubmit`, `EmptyState`, `SectionCard`, `MetricValue`
- AppShell with role-aware nav, sidebar layout, chromeless prefix routing
- AuthShell split-screen with editorial taglines
- Serif (DM Serif Display) reserved for hero h1, MetricValue numbers, EmptyState taglines, wordmarks
- Sans (DM Sans) for everything else
- `.btn-primary` (navy bg / gold text) is the only primary action; `.btn-gold` removed
- 22 per-segment error boundaries (`components/SegmentError`)

### Tests + safety nets
- 300+ Vitest tests passing on `main`
- E2E TPA onboarding chain test (`__tests__/e2e/onboarding-chain.test.ts`)
- Pre-commit hooks: type-check + lint
- Demo-mode guards: every external integration short-circuits to deterministic stubs when env is missing
- Auth-guard hardening: demo-mode admin bypass closed in production (`e1615ed`)
- Anti-enumeration on magic-link endpoint (always 202, never reveals existence)

### Marketing surface (Vercel, unchanged)
- `vantaum.com` is the marketing site — DO NOT touch unless intentionally relaunching marketing
- `app.vantaum.com` is the AWS Fargate app — that's where customer work happens

---

## §2 — What's actually left to "launched"

Honest gap list. Each item gets:
- **What** the work is
- **Why** it matters
- **Where** the code lives
- **Effort** (S = <2h, M = ½–1 day, L = 1–3 days)

### A. Integration keys & external configuration (the real blocker)

These are vendor accounts + keys that the application code already expects. No
code changes required — just provisioning. Bracket each one with a smoke test
defined in §7.

| Vendor | What | Status | Where in code | Effort |
|---|---|---|---|---|
| **SES** | Verify `vantaum.com` domain via 3 DKIM CNAMEs | Domain identity exists, DKIM tokens generated, DNS records not yet added to Google Cloud DNS. SES verification status: `FAILED`. | `infra-aws/lib/email-stack.ts` + AWS Console SES → Verified identities | S (10 min + DNS propagation) |
| **SES production access** | Exit sandbox so we can send to any recipient | Currently sandbox-only. Need to file a support ticket. | n/a — AWS console + ticket | M (24–48h AWS wait time) |
| **Anthropic** | API key for Claude (brief gen, fact-check, IDR analysis) | Slot in `vantaum-prod-third-party-keys`, **empty** | `lib/env.ts::isRealAnthropicEnabled()` | S |
| **HelloSign / Dropbox Sign** | API key + client ID for contract signature | Slots empty | `lib/contracts/hellosign.ts` | S |
| **Phaxio** | API key + secret + callback token for eFax intake | Slots empty | `lib/intake/efax/phaxio-adapter.ts` | S |
| **Google Cloud Vision** | API key for OCR on inbound faxes | Slot empty | `lib/intake/efax/ocr.ts` | S |
| **Gravity Rail** | Account-level API key + per-concierge workspace provisioning | Slot empty + UX work needed | `lib/gravity-rails.ts` + new code per §6 | M (per-concierge wiring) |
| **Meow** | API key + entity ID + collection account ID + product ID | Slots empty, **blocked on Jonah provisioning a dedicated "VantaUM" Meow account** (see `docs/meow-bootstrap-resume.md`) | `lib/billing/meow-client.ts` | M (after Jonah finishes Meow setup) |
| **Sentry** | DSN for error reporting | Slot empty, code wired | `lib/error-reporting.ts` (slot) | S |
| **CRON_SECRET** | Bearer token for `/api/cron/*` endpoints | Slot empty | `lib/cron-auth.ts` | S (one openssl rand) |

**Once the vendor keys are filled**, the deploy procedure is:

1. Update the AWS Secrets Manager vault `vantaum-prod-third-party-keys` via
   AWS CLI (NOT the Console — the Console mangled values last time per
   STATE.md). Use the CLI pattern in `docs/meow-bootstrap-resume.md` step 2.
2. Run `aws ecs update-service --cluster vantaum-prod --service vantaum-prod-app --force-new-deployment --profile vantaum --region us-east-1`
3. Wait for `aws ecs describe-services` to show one PRIMARY at Running:1.
4. Run the smoke tests in §7.

### B. Polish + hardening (the 81–100 block from the original master plan)

These are tracked as ordered tasks in this conversation (and in Grok's
context). Status as of 2026-05-21:

- ✅ #81 Global error boundaries + graceful degradation (22 segment-level
  `error.tsx` files + `components/SegmentError`)
- ⏳ #82 Consistent loading + skeleton states (not started)
- ⏳ #83 Actionable empty states (`EmptyState` exists; not consistently applied)
- ⏳ #84 Rate-limit + abuse protection on all public + auth mutation endpoints
- ⏳ #85 PII/PHI redaction in logs / audits / errors
- ⏳ #86 Structured logging + request IDs on all API routes
- ⏳ #87 Instrument key user journeys (signup → approval → first case)
- ⏳ #88 Basic operational dashboards (err rate, signup funnel, case throughput)
- ⏳ #89 Alerting hooks for critical paths
- ⏳ #90 Runbooks for common production issues
- ⏳ #91 Mobile responsiveness pass
- ⏳ #92 Accessibility audit (keyboard, ARIA, contrast)
- ⏳ #93 Typography & spacing consistency sweep (the global serif strip + btn-gold removal are done; the rest of this is small)
- ⏳ #94 Remove legacy Frame / old layout components
- ⏳ #95 Apply new design system to `/signup-tpa` (currently the marketing-style form lives outside the design system)
- ⏳ #96 Performance profiling + bundle reduction
- ⏳ #97 Final security review (CSP, auth edges, injection on contract gen)
- ⏳ #98 Internal team onboarding docs + runbooks
- ⏳ #99 Final E2E manual test on production
- ⏳ #100 Tag v1.0 + write known-gaps / post-v1 backlog

**Effort estimate for the 19 remaining items: ~2 weeks for one developer if
worked sequentially, faster if Claude/Grok continue to assist.**

### C. Care Management (Phase 3)

Per `docs/v1-roadmap-gap-analysis-2026-05-19.md`, **Phase 3 (CM-01 → CM-05) is
0% implemented.** Only a future-proof comment in migration 021. This is
explicitly post-v1 and intentionally not in this launch plan. Mention to the
developer; do not block on it.

---

## §3 — The Tuesday-week plan (suggested order)

A concrete 5-day plan for the developer's first week back. Adjust based on
their skill profile. Every day starts with `git pull`, ends with `git push`.

### Tuesday — orient + close the SES gap
1. Read this doc, `STATE.md`, and `git log --oneline -50`.
2. Pair with Jonah (or read `docs/ses-verification-runbook.md`) to add the 3
   DKIM CNAMEs to Google Cloud DNS for `vantaum.com`. The exact tokens are
   in AWS Console → SES → Verified identities → `vantaum.com` → Authentication.
3. Wait for verification (~5–60 min). File the SES production-access support
   ticket immediately after; the 24–48h clock starts now.
4. Fill the easy vendor slots in the secrets vault: Anthropic, HelloSign,
   Phaxio, Google Vision, Sentry, CRON_SECRET. Use the AWS CLI pattern from
   `docs/meow-bootstrap-resume.md` — never the Console.
5. Rebuild + redeploy the Fargate container so the new secrets land. Runbook:
   `docs/container-rebuild-2026-05-13.md`. ~25 min total.
6. Run the smoke tests in §7. Anything failing becomes Wednesday's first task.

### Wednesday — Gravity Rails per-concierge wiring (see §6)
1. Build the per-concierge workspace provisioner.
2. Add the GR workspace ID to the concierge profile schema (migration 027).
3. Wire the concierge inbox to render GR chats inline.
4. End-to-end test: TPA submits via Gravity Rail chat → row appears in our
   case queue → concierge picks it up → determination flows back.

### Thursday — Polish block, batch 1
- #82 skeleton states (highest-impact UX item, ~3h)
- #83 empty states sweep (~2h)
- #91 mobile responsiveness pass (~3h)

### Friday — Polish block, batch 2
- #92 accessibility audit (~3h)
- #94 remove legacy Frame components (~2h)
- #95 design-system migration of `/signup-tpa` (~3h)

### Monday (week 2) — Observability + alerting
- #84 rate-limit middleware everywhere
- #85 PII redaction audit
- #86 structured logging
- #87 user-journey instrumentation
- #88 ops dashboards

Then #89, #90, #96, #97 sequentially. #99 (E2E manual test on prod) and #100
(v1.0 tag) are the final gates.

---

## §4 — Definition of done (per item)

A task is done when **all four** are true:

1. Code is on `origin/main` (not a feature branch).
2. Build is green: `npm run build && npm run test:ci`.
3. Vercel preview deploy is Ready (or Fargate post-deploy smoke tests pass).
4. The item is checked off in this doc with a one-line note (date + commit
   SHA + what's verifiable about it).

### Definition of done — for the launch as a whole

1. All §2 items either ✅ or explicitly punted to a post-v1 backlog with
   reason recorded.
2. `STATE.md` updated to reflect "shipped" status.
3. v1.0 tag created in git.
4. A 5-minute Loom recorded that walks through `/portal/tpa/submit` →
   approval → `/cases/[id]` → determination → invoice generation. The Loom
   is the proof.

---

## §5 — Environment + access checklist

Before the developer can be productive, they need:

- [ ] GitHub access to `WellsOnyx/vantahg-brief-engine` (Jonah adds them)
- [ ] AWS IAM user under account `309921834034` with the same policies as
      `claude-vantaum-deploy` (read STATE.md "Identifiers To Remember" for the
      ARNs)
- [ ] Local AWS profile named `vantaum` configured to that user
- [ ] Google Cloud DNS access for `vantaum.com` (or someone with that access
      they can ping when DNS edits are needed)
- [ ] Notion access to the Wells Onyx workspace
- [ ] Linear access (or whatever issue tracker we end up on — currently none)
- [ ] Vercel team access for `wellsonyx-projects`
- [ ] Squarespace access for `wellsonyx.com` DNS (separate from `vantaum.com`)
- [ ] AWS Secrets Manager read access on `vantaum-prod-third-party-keys`
      and `vantaum-prod-db-admin-credentials`
- [ ] Docker + colima installed locally (for arm64 container rebuilds)
- [ ] CDK CLI: `npm install -g aws-cdk` (this repo pins via local `node_modules`
      so global isn't strictly required)

---

## §6 — Gravity Rail: the per-concierge model

**Premise (per Jonah, 2026-05-21):** each concierge is paired with exactly
one Gravity Rail workspace. The GR workspace handles AI-driven intake
(member chat, phone-SMS, etc.) and hands cases off to the concierge's queue
in VantaUM.

This is **not** a single global GR integration. Each concierge needs:

- Their own GR workspace ID stored on their `staff` row
- Their own GR workflow ID for "intake → handoff to concierge queue"
- A webhook endpoint we expose for GR to call when intake completes
- A bidirectional sync between GR's chat history and VantaUM's case audit
  trail (so the determination has full context of what was discussed)

### What's already in place

- ✅ Account-level GR API client at `lib/gravity-rails.ts`
- ✅ Workspace + workflow + chat + message route handlers under `/api/gr/`
- ✅ Bearer-token auth pattern matches GR's API v2 docs
- ✅ Env slot `GRAVITY_RAIL_API_KEY` wired through compute-stack to Fargate

### What needs to be built

**Schema (migration 027):**
```sql
ALTER TABLE staff
  ADD COLUMN gr_workspace_id text,         -- UUID, the GR workspace this concierge owns
  ADD COLUMN gr_workflow_id  integer,      -- the "intake → handoff" workflow
  ADD COLUMN gr_provisioned_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_gr_workspace_idx
  ON staff (gr_workspace_id) WHERE gr_workspace_id IS NOT NULL;
```

**Provisioner (`lib/gravity-rails/provisioner.ts`):**
- Input: a concierge `staff` row
- Steps: create GR workspace → create the "intake → handoff" workflow in
  that workspace → store both IDs on the staff row
- Idempotent: if `gr_workspace_id` is already set, no-op

**Inbound webhook (`app/api/gr/webhook/route.ts`):**
- GR posts when an intake chat reaches "handoff" state
- We translate the GR chat payload into a `cases` row + initial audit entry,
  tagged with the concierge's `staff_id`

**Outbound sync:**
- When a case progresses (concierge accepts / clinician reviews / determined),
  POST a message back into the GR chat thread so the AI assistant can update
  the member

**UX:**
- `/concierge` inbox renders a "GR chats" panel showing live conversations
  using `components/GravityRailChat.tsx`
- "Pull into VantaUM as case" button on each GR chat

### Where Gravity Rail's docs live

- API v2 reference: https://api.gravityrail.com/api/v2 (the URL in
  `lib/gravity-rails.ts:11`)
- Confirm with their team: do they support outbound webhooks at workflow
  completion? What's their preferred handoff mechanism?

**Open question for Jonah:** is the per-concierge GR workspace billed
per-workspace by GR, or is it included? This affects how aggressively we
provision workspaces during signup.

---

## §7 — Smoke tests (run after every deploy)

Save this as `scripts/smoke-test.sh` if it doesn't already exist. Each test
should be one line, exit non-zero on failure, and emit a clear message.

```bash
#!/usr/bin/env bash
set -euo pipefail

APP="https://app.vantaum.com"
MARKETING="https://vantaum.com"

# Marketing surface (Vercel)
test "$(curl -s -o /dev/null -w '%{http_code}' "$MARKETING/")" = "200" \
  && echo "✓ marketing / → 200" || (echo "✗ marketing / failed"; exit 1)

# App surface (Fargate)
test "$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/health")" = "200" \
  && echo "✓ app /api/health → 200" || (echo "✗ /api/health failed"; exit 1)

# Critical authenticated routes should redirect (307) to /login, not 404 or 500
for route in /portal/tpa /portal/provider /cases /concierge /admin/billing; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$APP$route")
  test "$code" = "307" -o "$code" = "200" \
    && echo "✓ $route → $code" || (echo "✗ $route → $code"; exit 1)
done

# Admin routes in prod demo mode should 401 (per e1615ed)
test "$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/admin/signups")" = "401" \
  && echo "✓ /api/admin/signups → 401 (demo-mode guard active)" \
  || (echo "✗ admin auth bypass open — STOP and investigate"; exit 1)

# Health endpoint reports connected database
curl -s "$APP/api/health" | grep -q '"database":"connected"' \
  && echo "✓ /api/health database=connected" \
  || echo "⚠ database not in connected state (could be demo_mode if Supabase env still empty)"

echo ""
echo "Smoke tests passed."
```

The fuller post-deploy verification list lives in
`docs/container-rebuild-2026-05-13.md` step 5.

---

## §8 — Things explicitly NOT in this launch plan

Recorded so they don't sneak back in:

- ❌ **Migrating off AWS to a different cloud.** Locked.
- ❌ **Stripe.** Meow is the billing system. Locked. See
      `docs/meow-bootstrap-resume.md`.
- ❌ **Supabase Auth (long-term).** V1 hybrid lets the marketing site keep
      using Supabase Auth, but the AWS app uses Cognito. New auth work goes
      through the Cognito path.
- ❌ **Care Management (Phase 3, CM-01 → CM-05).** Post-v1.
- ❌ **Real production prod-access SES out of sandbox.** File the ticket
      Tuesday but don't block launch on it. Sandbox is fine for verified
      recipients during early customer ramp.
- ❌ **A separate mobile app.** Mobile responsiveness pass (#91) is enough.
- ❌ **Real-time chat / websockets.** GR handles the realtime intake; our
      internal surfaces are request-response.

---

## §9 — When this doc gets stale

Update this doc inline when you ship items in §2. Move the `⏳` marker to
`✅` and add a one-line note `(YYYY-MM-DD, commit <sha>)`. Once 95% of §2 is
green and §7 smoke tests pass on Fargate, ship the v1.0 tag and call it.

If the developer disagrees with anything here, mesh Jonah before changing the
plan. Most of these were decided after real arguments and shouldn't be
re-relitigated lightly.

---

## Appendix A — File map for the new developer

| If you need to… | Look at… |
|---|---|
| Understand the build state right now | `STATE.md` |
| See what shipped in the last week | `git log --since="2026-05-15" --oneline` |
| Wire a new adapter | `lib/adapters/{storage,auth,email}/types.ts` (interface), then a sibling impl file |
| Add a new role | `lib/auth-guard.ts::INTERNAL_STAFF_ROLES` + RLS migration |
| Add a new page that doesn't fit existing templates | First try `components/layouts/PageLayouts.tsx` — it has 4 templates and an `EmptyState` |
| Add a new API route | Pattern from `app/api/cases/[id]/send-determination-email/route.ts` (auth gate + audit + idempotency) |
| Add a new test | `__tests__/` mirrors `lib/` structure; Vitest |
| Rebuild + push the Fargate image | `docs/container-rebuild-2026-05-13.md` |
| Wire Meow billing | `docs/meow-bootstrap-resume.md` |
| Verify SES | `docs/ses-verification-runbook.md` |
| Understand the demo mode | `docs/demo-mode-audit.md` |
| Know what's missing | THIS DOC (§2) |

---

## Appendix B — Locked decisions (do not re-litigate)

1. **Billing:** Meow, not Stripe. Reason: per-account collection account model
   and lower fees on ACH.
2. **Auth:** Cognito for the AWS app, Supabase Auth still wired for V1
   hybrid mode (so existing users don't have to re-onboard). New auth work
   goes through Cognito.
3. **Hosting:** Marketing on Vercel (`vantaum.com`), app on AWS Fargate
   (`app.vantaum.com`). The marketing site never leaves Vercel.
4. **Data:** RDS Postgres primary. Supabase still wired for V1 hybrid but
   `ENABLE_AWS_DB=true` on Fargate routes through the pg shim against RDS.
5. **Auth provider per entity:** Wells Onyx is the parent. VantaUM is the
   product. Jonathan Arias signs all contracts.
6. **Portals:** TPA and Provider are separate portals with separate routes
   and separate UX, even though they share components.
7. **Practice provisioning:** Self-serve invite from TPA admin (V1). No
   support-mediated provisioning.
8. **Gravity Rail:** Per-concierge workspace, one-to-one. Not a single global
   integration.
9. **IDR / appeals:** First-pass appeal lives in the concierge flow
   (`FileFirstAppealModal`). Payer IDR is a separate `case_type='payer_idr'`
   with a dedicated `idr-attorney` role. Both shipped.
10. **Design system:** DM Serif Display for hero h1 + brand wordmarks + number
    displays + empty-state taglines only. Sans everywhere else.
    `.btn-primary` is the only primary action; `.btn-gold` removed.
11. **Florida governance.** Locked.

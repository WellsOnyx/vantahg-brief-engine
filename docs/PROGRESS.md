# Customer-ready build progress (2026-09-18; packaging lock 2026-09-20)

**North star:** intake → rules → brief → MD sign → outbound decision → billable event → report  
**Plan:** [`docs/customer-ready/`](docs/customer-ready/00-README.md) · implement via [`10-implementation-commits.md`](docs/customer-ready/10-implementation-commits.md)  
**Status board:** [`STATE.md`](STATE.md)

## Merged to `main` (this sprint)

| Phase | PR | What landed |
|-------|-----|-------------|
| Docs | [#51](https://github.com/WellsOnyx/vantahg-brief-engine/pull/51) | Full customer-ready plan under `docs/customer-ready/` (12 ordered commits) |
| 0.1 AWS SoR | [#50](https://github.com/WellsOnyx/vantahg-brief-engine/pull/50) | RDS migrations, SES adapter, S3 on Fargate, honest `ENABLE_AWS_*` flags |
| 0.2 Cognito | [#53](https://github.com/WellsOnyx/vantahg-brief-engine/pull/53) | Auth cutover path behind `ENABLE_AWS_AUTH` (defaults **false**) |
| 1 Case spine | [#52](https://github.com/WellsOnyx/vantahg-brief-engine/pull/52) | State machine, `audit_events`, R01–R16 rules, `/api/case-spine` |
| 2 Intake | [#54](https://github.com/WellsOnyx/vantahg-brief-engine/pull/54) | Gravity Rail + external submit + Phaxio → spine; versioned `client_config` |
| 3 Brief → MD | [#55](https://github.com/WellsOnyx/vantahg-brief-engine/pull/55) | Brief before `md_queue`, `/med-review` queue, human sign + immutable package |
| 4 Fan-out + billing | [#57](https://github.com/WellsOnyx/vantahg-brief-engine/pull/57) | Portal downloads, HMAC `determination.signed` + retries, real `billable_events` ledger, monthly statement stub |
| 4.4 Statement stub | this PR | PDF + portal for one synthetic client; `statement_id` stamped on open ledger events; monthly cron stub |
| 5 Three role views | [#58](https://github.com/WellsOnyx/vantahg-brief-engine/pull/58) | Client / CX / Med lenses on one case object; RBAC deny cross-tenant + CX-note isolation |
| 6 Reporting + CM | [#59](https://github.com/WellsOnyx/vantahg-brief-engine/pull/59) | Five client reports + CSV, CM HMAC handoff (flagged only), ops scoreboard |
| 7 Onboarding + go-live | [#60](https://github.com/WellsOnyx/vantahg-brief-engine/pull/60) | A→E checklist UI + runbook, E1/E2 packs, first-25 SLA rollback log |

**CI (Phase 7 tip):** `npm run test:ci` 447 passed (3 todo); `tsc --noEmit` clean; `npm run test:go-live-synthetic` PASS.

## 2026-09-20 — Packaging lock (Jonah)

Paid door = Med Review (VantaHG). VantaUM Brief Engine / UM is **included free only when the buyer uses Vanta med review**. Not a standalone free UM SKU; not free with another shop’s med review. Compute COGS planning band ~$0.05–$0.15 per review vs ~$1 internal budget (estimate; not measured COGS). Phases 0–7 code path unchanged — packaging/GTM + product-boundary only. Canonical: [`docs/customer-ready/01-product-boundary.md`](docs/customer-ready/01-product-boundary.md).

## Not started / paused

| Phase | Status |
|-------|--------|
| 4 Fan-out + billing ledger | ✅ **Done** — portal downloads, HMAC webhook retries → `fanout_failed` + CX task, ledger on sign, statement stub |
| 5 Three role views (Client / CX / Med polish) | ✅ **Done** — `/client`, `/cx`, `/med-review` share `/api/case-spine` + role filters |
| 6 Reporting + CM handoff | ✅ **Done** — `/portal/tpa/reports`, `/portal/tpa/cm`, `/api/ops/scoreboard` |
| 7 Onboarding runbook + synthetic/shadow/live gates | ✅ **Done** — `/admin/onboarding`, `docs/onboarding/`, `npm run test:go-live-synthetic`. Remaining = human ops |

## Still needs a human (not code)

- SES domain verify + sandbox exit for `vantaum.com`
- Fargate image rebuild / deploy from current `main`
- Flip `ENABLE_AWS_AUTH=true` only after a staging tenant is ready
- Client BAA + subprocessor BAAs before live PHI
- Gravity Rail / Phaxio / HelloSign / Meow **production keys** (slots only today)
- RDS-native bootstrap scripts (current bootstrap still Supabase JS)

## How to run (quick)

```bash
npm install
npm run dev          # demo — no secrets
# AWS-shaped local: see .env.local.example Path A + npm run db:migrate:rds
```

Synthetic spine smoke (after Phase 2+):

```bash
curl -s -X POST http://localhost:3000/api/intake/gravity-rail \
  -H 'content-type: application/json' \
  -d '{"synthetic":true,"member_ref":"memb_synth_001","requesting_provider":"prov_synth_001","service_or_rx":"CPT-73721","place_of_service":"office","urgency":"standard","clinicals_pointer":"s3://synth/packet/001.pdf","external_id":"gr-1","benefit_type":"medical"}'

curl -s -X POST http://localhost:3000/api/case-spine/md-queue \
  -H 'content-type: application/json' \
  -d '{"seed":true}'
# then open /med-review
# After MD sign: POST /api/case-spine/:id/fanout
# Portal: /portal/tpa/determinations  ·  statement: /portal/tpa/statements
# Lenses: /client  ·  /cx  ·  /med-review
# Reports: /portal/tpa/reports  ·  CM: /portal/tpa/cm  ·  scoreboard: /cx
# Onboarding: /admin/onboarding  ·  npm run test:go-live-synthetic
```

## Roadmap / next connectors

Queued after customer-ready Phases 0–7. These do **not** reopen the completed code path and are **not** a Phase 8. Remaining go-live work is still human ops (SES, Fargate, BAA, vendor keys).

### Muse Connector Platform (muse.ai) — queued / not started

| Field | Detail |
|---|---|
| **Status** | Queued / not started |
| **Intent** | Submit or build a VantaUM Muse connector so CX/relationship touchpoints can meet users in Muse. Clinical system of record stays on AWS Brief Engine. |
| **Constraint** | Not a live PHI path. No live PHI in Muse without a separate BAA decision. |
| **Source** | Public open-access for developers to build Muse connectors (API brought by us). Meta opened developer access 2026-09-19 — "Meet your users where they are with Muse Connector Platform" / Submit a connector. |
| **Owner** | VantaUM |
| **Depends on** | Customer-ready ops (Fargate / SES / BAA) are **not** required to research or submit a connector. Production use is gated by HIPAA review. |

## Lane note

VantaUM owns Brief Engine SoR/tech + UM ops. VantaHG owns IDR/IRO and **sells** Med Review (paid door). UM Brief Engine is included under that Vanta med-review contract only — not a standalone free UM SKU, not free with another shop’s med review. See [`docs/customer-ready/01-product-boundary.md`](docs/customer-ready/01-product-boundary.md).

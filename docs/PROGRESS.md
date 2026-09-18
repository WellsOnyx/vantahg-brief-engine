# Customer-ready build progress (2026-09-18)

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

**CI (Phase 3 tip):** `npm run test:ci` ≈ 402 passed (3 todo); `tsc --noEmit` clean.

## Not started / paused

| Phase | Status |
|-------|--------|
| 4 Fan-out + billing ledger | **Paused** (status to Cole first) — portal downloads, webhook retries, `billable_events`, statement stub |
| 5 Three role views (Client / CX / Med polish) | Open |
| 6 Reporting + CM handoff | Open |
| 7 Onboarding runbook + synthetic/shadow/live gates | Open |

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
```

## Lane note

VantaUM owns this Brief Engine + UM ops path. VantaHG owns IDR/IRO. Med Review + Brief Engine packaging is **not locked** — see `docs/customer-ready/01-product-boundary.md`.

# Customer-ready build progress (2026-09-18; packaging ownership corrected 2026-09-21)

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
| 4.4 Statement stub | [#73](https://github.com/WellsOnyx/vantahg-brief-engine/pull/73) | PDF + portal for one synthetic client; `statement_id` stamped on open ledger events; monthly cron stub |
| 5 Three role views | [#58](https://github.com/WellsOnyx/vantahg-brief-engine/pull/58) | Client / CX / Med lenses on one case object; RBAC deny cross-tenant + CX-note isolation. 5.3 polish: sign / brief POST / fan-out / audit role gates + cross-tenant denial tests. |
| 6 Reporting + CM | [#59](https://github.com/WellsOnyx/vantahg-brief-engine/pull/59) | Five client reports + CSV, CM HMAC handoff (flagged only), ops scoreboard |
| 7 Onboarding + go-live | [#60](https://github.com/WellsOnyx/vantahg-brief-engine/pull/60) | A→E checklist UI + runbook, E1/E2 packs, first-25 SLA rollback log |
| 7.1 Cole runbook | [#64](https://github.com/WellsOnyx/vantahg-brief-engine/pull/64) | How-to on every A–E item, `11-cole-onboarding-runbook.md`, synthetic `client_config` fixture |
| 7.2 E1 fixture pack | [#65](https://github.com/WellsOnyx/vantahg-brief-engine/pull/65) | `fixtures/golive/synthetic-e1.json` — prior auth + first-level appeal, tokenized refs, `npm run test:synthetic-golive-pack` |
| 8 Muse CX stub | this PR | `lib/muse` + `/api/muse/*` + `/cx` panel. CX relationship metadata only. Not live-keyed. No PHI. Spec: [`12-muse-connector.md`](customer-ready/12-muse-connector.md) |
| Go-live ops | this PR | Cole punch list: [`13-go-live-ops.md`](customer-ready/13-go-live-ops.md) |

**CI (Phase 7.2 on current main):** `npm run test:ci` 503 passed (3 todo); `tsc --noEmit` clean; `npm run test:go-live-synthetic` PASS; `npm run test:synthetic-golive-pack` PASS; `npm run test:shadow-golive-pack` PASS.

## 2026-09-21 — Packaging ownership correction (Jonah)

**VantaUM sells Med Review** as the paid wedge. Brief Engine / UM is included free **only** when the buyer uses Vanta med review under **UM’s contract**. No standalone free UM SKU. No free UM with a third-party review shop. **VantaHG = IRO + IDR only** — not the med-review commercial door. Optum frozen (no outreach). Compute COGS planning band ~$0.05–$0.15 per review vs ~$1 internal budget (estimate; not measured COGS). Phases 0–7 code path unchanged — packaging/GTM + product-boundary only. Canonical: [`docs/customer-ready/01-product-boundary.md`](docs/customer-ready/01-product-boundary.md). Code gate unchanged: `client_config.vanta_med_review_contract` + `med_review_provider=vanta` in `lib/entitlements/um-brief-engine.ts`.

**CI (packaging guard):** `npm run test:ci` 480 passed (3 todo) on the guard merge. RDS-native bootstrap is on `main` via [#74](https://github.com/WellsOnyx/vantahg-brief-engine/pull/74). This runbook PR does not rewrite those scripts.

## 2026-09-23 — Two-line card wired to the ledger

Route assignment and MD sign upsert one `um_review` row from `lib/billing/um-price-card.ts`. Auto and gold-card post at $0. The synthetic go-live client still mints the legacy $45/$75/$25 SKUs; the statement drops those rows when `um_review` exists. Monthly `um_platform` comes from lives-in-month (fixture: 1,200 lives / 800 employees — not the planning denominators). Operator steps: [`14-billing-wire.md`](customer-ready/14-billing-wire.md). Platform stays $1.50 unless an explicit fat-TPA waiver. No live PHI.

## 2026-09-23 — Pricing memo sync (Jonah Manning)

Working decision memo: [`pricing-strategy-memo-2026-09-23.md`](customer-ready/pricing-strategy-memo-2026-09-23.md). Rate card and [`um-pricing-rules.md`](customer-ready/um-pricing-rules.md) point at it. Dollar amounts in `lib/billing/um-price-card.ts` are unchanged.

Restored: operating targets (auto ≥55% by month 12, nurse ≤18 min, MD ≤8%, external ≤2.5%, first-pass ≥90%), the 733k-lives / 2.2 note, ~43 FTE staffing note on 285k nurse reviews, criteria + residual **$2–5M** (required COGS, separate from variable COGS $22.8M), vendor comparison ($70M+ vs $45.6M review line) as an advisor slide only, 400k inbound downside, and GTM (buyer = self-funded employer or TPA that owns the group). Commercial R10–R13 are restored to Jonah’s meanings. Deck rules D1–D8 match memo §9. Client materials lead with the fee table and 375k autos at $0. Do not publish internal margins. External slides are illustrative.

## 2026-09-23 — Gold-card $0 review (after the two-line card)

`gold_card` posts a review row at **$0** (not billable), same as rules/auto. Rule index [`um-pricing-rules.md`](customer-ready/um-pricing-rules.md) has R1–R20, WHAT NOT TO DO, and deck-only D1–D8. Open question stays open: Med Review does not zero the $1.50 platform unless a fat-TPA waiver. First-pass tile stays an em dash.

## 2026-09-23 — Two-line UM pricing (supersedes the review-only card)

Platform membership + one clinical review tier. Canonical card: [`docs/customer-ready/um-unit-economics-rate-card.md`](customer-ready/um-unit-economics-rate-card.md). Handoff: [`docs/customer-ready/um-pricing-rules.md`](customer-ready/um-pricing-rules.md). Config: `lib/billing/um-price-card.ts`. Migration `infra-aws/rds-migrations/032_um_two_line_pricing.sql`.

333k EE (PEPM) / 500k lives (PMPM) / 750k inbound. Platform **$9.00M**. Deck total revenue **$54.61M** (exact dollars **$54.60M**). Exact contribution **$31.80M**. Total billed **$13.67 PEPM / $9.11 PMPM**. Rules/auto review posts at **$0**. Nurse / MD / external bill once. Platform default **$1.50 PMPM** and does not step down. Packaging unchanged except the open question: do not call the new platform fee $0 under Med Review. VantaHG = IRO + IDR only. Optum frozen. Entitlement gate not flipped.

The earlier review-only figures ($45.61M / $11.42 PEPM) are retired.

## 2026-09-23 — UM unit economics rate card (superseded)

Review-only card landed in PR #78 and is replaced by the two-line section above. Do not quote $45.61M as current revenue.

## Not started / paused

| Phase | Status |
|-------|--------|
| 4 Fan-out + billing ledger | ✅ **Done** — portal downloads, HMAC webhook retries → `fanout_failed` + CX task, ledger on sign, statement stub |
| 5 Three role views (Client / CX / Med polish) | ✅ **Done** — `/client`, `/cx`, `/med-review` share `/api/case-spine` + role filters |
| 6 Reporting + CM handoff | ✅ **Done** — `/portal/tpa/reports`, `/portal/tpa/cm`, `/api/ops/scoreboard` + `/admin/ops` (fail rate + stuck count) |
| 7 Onboarding runbook + synthetic/shadow/live gates | ✅ **Done** — `/admin/onboarding`, `docs/onboarding/`, `fixtures/golive/synthetic-e1.json`, `npm run test:go-live-synthetic` + `npm run test:synthetic-golive-pack`. Remaining = human ops |
| 7.1 Cole A→E without tribal knowledge | ✅ **#64** — `docs/customer-ready/11-cole-onboarding-runbook.md`, how_to per item, synthetic fixture |

## Still needs a human (not code)

Ordered steps, no guessing: [`docs/customer-ready/13-go-live-ops.md`](customer-ready/13-go-live-ops.md).

- SES domain verify + sandbox exit for `vantaum.com`
- Fargate image rebuild / deploy from current `main`
- Flip `ENABLE_AWS_AUTH=true` only after a staging tenant is ready
- Client BAA + subprocessor BAAs before live PHI ([`06-hipaa-baa-path.md`](customer-ready/06-hipaa-baa-path.md))
- Gravity Rail / Phaxio / HelloSign / Meow **production keys** (slots only today). Gravity Rail loop on `main` is code-complete and not live-keyed: production webhook with no secret fails closed; outbound without `GRAVITY_RAIL_API_KEY` is 503.
- Run the first real client roster against production RDS when that client exists (`npm run bootstrap-real-client` after `npm run db:migrate:rds`, including case spine `027`). The script is RDS-native. Do not put live PHI in the command or in shared logs.
- **No live PHI until the BAA path in step 6 of the punch list is confirmed.**

Muse (`MUSE_API_KEY`, `MUSE_WEBHOOK_SECRET`, `MUSE_CX_ENABLED`) stays empty for go-live. It is a CX stub, not a clinical connector.

## RDS bootstrap (available)

`scripts/bootstrap-real-client.ts` and `scripts/seed-demo.ts` use the pg shim when `ENABLE_AWS_DB=true` plus `DATABASE_URL` (or `DB_HOST` + `DB_PASSWORD`). That path does not read Supabase URL keys and does not call Supabase Auth admin. With a configured database, `bootstrap-real-client --dry-run` checks existing rows and does not insert. With no database env, `--dry-run` prints the plan and does not connect. `seed-demo --dry-run` never connects.

```bash
npm run db:migrate:rds
ENABLE_AWS_DB=true DATABASE_URL=postgres://... DATABASE_SSL=disable \
  npx tsx scripts/bootstrap-real-client.ts --dry-run \
  --client-name "Acme TPA" --contact-email ops@acme.example \
  --lpn-name "Pat LPN" --lpn-email pat@vantaum.example

# Synthetic demo rows (not live PHI). --dry-run does not connect.
ENABLE_AWS_DB=true DATABASE_URL=... npx tsx scripts/seed-demo.ts --dry-run
```

`ENABLE_AWS_DB` left false keeps the leftover Supabase JS client (`SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). `scripts/bootstrap-master-admin.ts` stays on that hybrid Auth admin path and refuses to run when `ENABLE_AWS_DB=true` (the shim has no `.auth`, and the script does not invent a password or flip `ENABLE_AWS_AUTH`).

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
# Reports: /portal/tpa/reports  ·  CM: /portal/tpa/cm  ·  scoreboard: /admin/ops + /cx
# Onboarding: /admin/onboarding  ·  npm run test:synthetic-golive-pack · npm run test:go-live-synthetic · npm run test:shadow-golive-pack
```

## Roadmap / next connectors

Phases 0–7 are the customer-ready code path. Phase 8 below is a CX stub and does not reopen that path. Remaining go-live work is human ops — follow [`13-go-live-ops.md`](customer-ready/13-go-live-ops.md).

### Muse Connector Platform (muse.ai) — Phase 8 stub

| Field | Detail |
|---|---|
| **Status** | Code-complete stub. Not live-keyed. No outbound HTTP. |
| **Intent** | CX / relationship touchpoints (account id, contact role labels, scheduling flags) so a later Muse connector has a fail-closed seam. Clinical system of record stays on AWS Brief Engine. |
| **Constraint** | No PHI in Muse. No live patient data. Production use still gated by [`06-hipaa-baa-path.md`](customer-ready/06-hipaa-baa-path.md). |
| **Code** | `lib/muse/`, `POST /api/muse/webhook`, `GET /api/muse/status`, `GET /api/muse/touchpoints`, `/cx` panel behind `MUSE_CX_ENABLED` + `MUSE_API_KEY`. |
| **Spec** | [`docs/customer-ready/12-muse-connector.md`](customer-ready/12-muse-connector.md) |
| **Source** | Public open-access for developers to build Muse connectors (API brought by us). Meta opened developer access 2026-09-19 — "Meet your users where they are with Muse Connector Platform" / Submit a connector. |
| **Owner** | VantaUM |
| **Depends on** | Nothing in Phases 0–7. Not required for the Cole go-live punch list. |

## Lane note

VantaUM owns Brief Engine SoR/tech + UM ops and **sells Med Review** (paid wedge). Brief Engine / UM is included free only under UM’s Vanta med-review contract — no standalone free UM SKU, no free UM with a third-party review shop. VantaHG owns **IRO + IDR only**. See [`docs/customer-ready/01-product-boundary.md`](docs/customer-ready/01-product-boundary.md).

## HG lane — IDR Ops assist (2026-09-20)

Merge-safe guards on `main` (never-submit, DRAFT stamp, private-bind, human-only DLI/attestation). Module: `lib/idr-assist/`. Workflow: [`docs/idr-assist/internal-review-workflow.md`](idr-assist/internal-review-workflow.md). Stale PRs #44 / #46 were **not** merged. No portal submit automation. Human signs determinations. **CI:** `npm run test:ci` 519 passed (3 todo); `tsc --noEmit` clean.

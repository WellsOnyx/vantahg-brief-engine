# Go-live fixture packs

Tokenized synthetic catalogs. **No live PHI. No `ENABLE_AWS_*` flag flips. No vendor keys. No Optum.**

Packaging lock (corrected 2026-09-21): **VantaUM sells Med Review.** Brief Engine / UM is included free **only** under UM’s Vanta med-review contract — no standalone free UM SKU, no free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Optum frozen.

## Phase 7.2 — Synthetic pack (E1)

Ten synthetic **prior auth** and **first-level appeal** fixtures that exercise the north-star loop on the demo / memory path.

Catalog: [`synthetic-e1.json`](synthetic-e1.json)

| id | type | source | scenario | after create | after pack runner |
|----|------|--------|----------|--------------|-------------------|
| e1-happy-01 | prior_auth | Gravity Rail | happy | `received` | `md_queue` (meet) |
| e1-happy-02 | prior_auth | external API | happy | `received` | `md_queue` (meet) |
| e1-happy-03 | prior_auth | Phaxio fax | happy + sign | `received` | `determined` |
| e1-happy-04 | prior_auth | case-spine | happy / pharmacy | `received` | `md_queue` (meet) |
| e1-appeal-01 | first_level_appeal | case-spine | happy (parent e1-happy-04) | `received` | `md_queue` (meet) |
| e1-appeal-02 | first_level_appeal | Gravity Rail | gray (parent e1-happy-01) | `received` | `md_queue` (gray) |
| e1-missing-01 | prior_auth | Gravity Rail | missing clinicals | `intake_incomplete` + SLA paused | same |
| e1-missing-02 | prior_auth | case-spine | missing member_ref | `intake_incomplete` + SLA paused | same |
| e1-missing-03 | first_level_appeal | case-spine | missing provider (R01) | `intake_incomplete` + SLA paused | same |
| e1-gray-01 | prior_auth | Phaxio fax | gray zone | `received` | `md_queue` (gray, unsigned) |

```bash
# Load JSON, reject PHI-shaped fields, create cases via case-spine + intake ingest
npm run test:synthetic-golive-pack

# Same catalog: advance happy/gray through brief → md_queue (and one MD sign)
npm run test:go-live-synthetic

# Vitest: disk load + POST through /api/intake/* and /api/case-spine (demo path)
npx vitest run __tests__/lib/golive/synthetic-fixtures.test.ts
```

Optional HTTP (dev server, demo admin in non-prod): `POST /api/golive/synthetic`, or POST each fixture to `/api/intake/gravity-rail`, `/api/external/submit`, `/api/intake/efax/phaxio` (`{ "synthetic": true, "fax": {...}, "intake": {...} }`), or `/api/case-spine`.

## Phase 7.3 — Shadow pack (E2)

Ten **live-shaped synthetic** prior-auth and first-level-appeal fixtures that MD-sign and fan out in **shadow mode**. Member / requesting-provider outbound is **intent only** — never a final send.

Every case is marked `shadow: true`. The pack is safe to run alongside a live tenant: it uses tokenized refs only and does not write live PHI.

Catalog: [`shadow-e2.json`](shadow-e2.json)

| id | type | source | determination | after pack runner |
|----|------|--------|---------------|-------------------|
| e2-shadow-01 | prior_auth | Gravity Rail | approve | `fanout_complete` (meet) |
| e2-shadow-02 | prior_auth | external API | approve | `fanout_complete` (meet) |
| e2-shadow-03 | prior_auth | case-spine | pend (gray) | `fanout_complete` (gray) |
| e2-shadow-04 | prior_auth | Phaxio fax | approve (urgent) | `fanout_complete` (meet) |
| e2-shadow-05 | prior_auth | case-spine | deny | `fanout_complete` (fail) |
| e2-shadow-06 | prior_auth | case-spine | partial | `fanout_complete` (meet) |
| e2-shadow-07 | prior_auth | Gravity Rail | approve (pharmacy) | `fanout_complete` (meet) |
| e2-shadow-08 | prior_auth | external API | pend (gray urgent) | `fanout_complete` (gray) |
| e2-shadow-09 | prior_auth | case-spine | approve (expedited) | `fanout_complete` (meet) |
| e2-shadow-10 | first_level_appeal | Phaxio fax | approve (parent e2-shadow-05) | `fanout_complete` (meet) |

```bash
# Load JSON, reject PHI-shaped fields, MD-sign + shadow fan-out (intent only)
npm run test:shadow-golive-pack

# Same catalog via the existing runner
npm run test:go-live-shadow

# Vitest: disk load + no-PHI + run alongside a live-mode client_config
npx vitest run __tests__/lib/golive/shadow-fixtures.test.ts
```

Optional HTTP: `POST /api/golive/shadow` (auth-gated; demo admin in non-prod).

### What “alongside live” means

- Cases carry `shadow: true` (catalog also has `shadow: true`).
- `runShadowPack` forces `shadow_mode` even if `client_config.go_live_mode=live`.
- Fan-out writes portal / archive / billing / CM as usual, but member and requesting-provider channels are `skipped` with `final_send=false` and `reason=shadow_mode_no_final_send`.
- Intake uses tokenized refs only. The loader rejects PHI-shaped keys (`patient_name`, `dob`, `ssn`, …) and non-`memb_synth_*` / `prov_synth_*` refs.

## Shared rules

Member / provider refs are tokens (`memb_synth_*`, `prov_synth_*`). Clinical pointers are `s3://synth/...`.

Do **not** set `ENABLE_AWS_DB`, `ENABLE_AWS_AUTH`, `ENABLE_AWS_STORAGE`, or `ENABLE_AWS_EMAIL` to run these packs. Empty HMAC slots stay empty — synthetic allow.

This is not live PHI and not a HIPAA attestation. Phase E still needs BAA + operator gates in `docs/onboarding/README.md`.

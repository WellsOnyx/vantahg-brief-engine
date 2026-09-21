# Phase 7.3 — Shadow go-live pack (E2)

Ten **live-shaped synthetic** prior-auth and first-level-appeal fixtures that MD-sign and fan out in **shadow mode**. Member / requesting-provider outbound is **intent only** — never a final send.

Every case is marked `shadow: true`. The pack is safe to run alongside a live tenant: it uses tokenized refs only and does not write live PHI.

**No live PHI. No `ENABLE_AWS_*` flag flips. No vendor keys. No Optum.**

Packaging lock: paid door = Med Review (VantaHG). Brief Engine / UM is included free **only** with Vanta med review — not a standalone free UM SKU.

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

Member / provider refs are tokens (`memb_synth_*`, `prov_synth_*`). Clinical pointers are `s3://synth/...`.

## How to run

From the repo root (demo mode — no env vars required):

```bash
# Load JSON, reject PHI-shaped fields, MD-sign + shadow fan-out (intent only)
npm run test:shadow-golive-pack

# Same catalog via the existing runner
npm run test:go-live-shadow

# Vitest: disk load + no-PHI + run alongside a live-mode client_config
npx vitest run __tests__/lib/golive/shadow-fixtures.test.ts
```

Optional HTTP (dev server already running, still demo / no secrets):

```bash
npm run dev
# then POST /api/golive/shadow  (auth-gated; demo admin in non-prod)
```

Do **not** set `ENABLE_AWS_DB`, `ENABLE_AWS_AUTH`, `ENABLE_AWS_STORAGE`, or `ENABLE_AWS_EMAIL` to run this pack. Empty HMAC slots stay empty — synthetic allow.

## What “alongside live” means

- Cases carry `shadow: true` (catalog also has `shadow: true`).
- `runShadowPack` forces `shadow_mode` even if `client_config.go_live_mode=live`.
- Fan-out writes portal / archive / billing / CM as usual, but member and requesting-provider channels are `skipped` with `final_send=false` and `reason=shadow_mode_no_final_send`.
- Intake uses tokenized refs only. The loader rejects PHI-shaped keys (`patient_name`, `dob`, `ssn`, …) and non-`memb_synth_*` / `prov_synth_*` refs.

## What this is not

- Not E1 synthetic (happy / missing clinicals / gray create-only). Use `npm run test:go-live-synthetic`.
- Not live PHI and not a HIPAA attestation.
- Not a production go-live. Phase E still needs BAA + operator gates in `docs/onboarding/README.md`.

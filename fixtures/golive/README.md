# Phase 7.2 — Synthetic go-live pack (E1)

Ten synthetic **prior auth** and **first-level appeal** fixtures that exercise the north-star loop on the demo / memory path.

**No live PHI. No `ENABLE_AWS_*` flag flips. No vendor keys.**

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

Member / provider refs are tokens (`memb_synth_*`, `prov_synth_*`). Clinical pointers are `s3://synth/...`.

## How to run

From the repo root (demo mode — no env vars required):

```bash
# Load JSON, reject PHI-shaped fields, create cases via case-spine + intake ingest
npm run test:synthetic-golive-pack

# Same catalog: advance happy/gray through brief → md_queue (and one MD sign)
npm run test:go-live-synthetic

# Vitest: disk load + POST through /api/intake/* and /api/case-spine (demo path)
npx vitest run __tests__/lib/golive/synthetic-fixtures.test.ts
```

Optional HTTP (dev server already running, still demo / no secrets):

```bash
npm run dev
# then POST /api/golive/synthetic  (auth-gated; demo admin in non-prod)
# or POST each fixture to:
#   /api/intake/gravity-rail
#   /api/external/submit
#   /api/intake/efax/phaxio   { "synthetic": true, "fax": {...}, "intake": {...} }
#   /api/case-spine
```

Do **not** set `ENABLE_AWS_DB`, `ENABLE_AWS_AUTH`, `ENABLE_AWS_STORAGE`, or `ENABLE_AWS_EMAIL` to run this pack. Empty HMAC slots stay empty — synthetic allow.

## What this is not

- Not E2 shadow (no member/provider final send). Use `POST /api/golive/shadow`.
- Not live PHI and not a HIPAA attestation.
- Not a production go-live. Phase E still needs BAA + operator gates in `docs/onboarding/README.md`.

# 13 — Go-live ops punch list (Cole)

**Owner:** Cole  
**Run this in order.** Do not guess missing steps.  
**This file is an operator script, not a HIPAA attestation.**

**Stop rule (read before step 1):** no live PHI until step 6 is confirmed. Steps 1–4 use empty secret slots, synthetic fixtures, and business-contact bootstrap fields only. Do not paste member names, DOB, clinical packets, or real fax images into commands, tickets, or this repo.

Packaging lock (do not change while running this):

- **VantaUM sells Med Review** (paid wedge).
- Brief Engine / UM is free **only** when `client_config.vanta_med_review_contract=true` and `med_review_provider=vanta`.
- No standalone free UM SKU. No free UM with a third-party review shop.
- **VantaHG = IRO + IDR only.**
- Optum frozen (no outreach).
- Guard: `lib/entitlements/um-brief-engine.ts`. Canonical: [`01-product-boundary.md`](01-product-boundary.md).

Gravity Rail stays fail-closed and idempotent on `POST /api/intake/gravity-rail`. Do not add a second case writer. Muse ([`12-muse-connector.md`](12-muse-connector.md)) is optional CX and is not required to finish this list.

---

## 1. Live env slots

Set these on the authenticated app (Fargate task / Secrets Manager), not in git and not on the public `vantaum.com` Vercel project. Names match [`.env.local.example`](../../.env.local.example). Leave a slot empty rather than inventing a value.

Repo defaults stay **false**. Flip a flag only on the deployment you are actually cutting over.

### Cognito

```bash
ENABLE_AWS_AUTH=true
COGNITO_USER_POOL_ID=<pool id>
COGNITO_CLIENT_ID=<app client id>
COGNITO_REGION=us-east-1
APP_URL=https://app.vantaum.com
```

Leave `ENABLE_AWS_AUTH=false` until the staging tenant exists. `scripts/bootstrap-master-admin.ts` stays on Supabase Auth admin and **refuses** when `ENABLE_AWS_DB=true`. Do not use it for the RDS path.

### RDS

```bash
ENABLE_AWS_DB=true
DATABASE_URL=postgres://...
# or: DB_HOST, DB_PORT=5432, DB_NAME=vantaum, DB_USER, DB_PASSWORD
# local docker only: DATABASE_SSL=disable
```

### SES

```bash
ENABLE_AWS_EMAIL=true
SES_FROM_ADDRESS=<verified identity>
SES_CONFIGURATION_SET=<optional>
```

Domain verify and sandbox exit are still human steps. Empty SES does not send live determination mail.

### S3

```bash
ENABLE_AWS_STORAGE=true
AWS_S3_BUCKET_PREFIX=vantaum-prod-
AWS_REGION=us-east-1
```

### Gravity Rail (when the workspace exists)

```bash
GRAVITY_RAIL_WEBHOOK_SECRET=<hmac secret>
# optional alias + rotation (any one validates):
GR_WEBHOOK_SECRET=
GR_WEBHOOK_SECRET_SECONDARY=
GRAVITY_RAIL_API_KEY=<server only>
GRAVITY_RAIL_WORKSPACE_ID=<real workspace uuid>
NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID=<same public id>
NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID=<site id>
```

Production with `GRAVITY_RAIL_WEBHOOK_SECRET`, `GR_WEBHOOK_SECRET`, and `GR_WEBHOOK_SECRET_SECONDARY` all unset returns **500** `webhook_secret_not_configured`. Empty `GRAVITY_RAIL_API_KEY` makes outbound **503** `not_configured` (no fake workspace).

### Packaging flags (client_config, not env)

Publish on the tenant (append-only `POST /api/client-config`):

- `vanta_med_review_contract`: `true` only for a buyer on Vanta med review under UM’s contract
- `med_review_provider`: `vanta` (`third_party` is always denied)

### Muse (optional — skip for first go-live)

Leave `MUSE_API_KEY`, `MUSE_WEBHOOK_SECRET`, and `MUSE_CX_ENABLED` unset. The `/cx` panel stays on the empty state. Do not put PHI in Muse. See [`12-muse-connector.md`](12-muse-connector.md).

### Check

After the task is running with the flags you intended:

```bash
curl -s https://app.vantaum.com/api/health
```

Expect `backends.db=rds`, `backends.auth=cognito`, `backends.storage=s3`, `backends.email=ses` only for the flags you actually set. A flag left false keeps the previous backend. That is correct.

---

## 2. Apply RDS migrations, including case spine `027`

Catalog and why each file exists: [`infra-aws/rds-migrations/README.md`](../../infra-aws/rds-migrations/README.md).  
Runner: `scripts/apply-rds-migrations.mjs` + `lib/db/rds-migrations.ts`.  
`027_case_spine.sql` is plain Postgres (spine columns, `audit_events`, `auth_rules`). The RDS copy wins when both the supabase and RDS files exist. Apply only after `cases` exists (000+). Do not apply files by hand in random order.

From a host that can reach the database (`DATABASE_URL`, or `DB_HOST` + `DB_PASSWORD`):

```bash
npm run db:migrate:rds:dry
npm run db:migrate:rds
npm run db:migrate:rds:status
```

In the dry-run plan, confirm a row with prefix **`027`** and filename **`027_case_spine.sql`** before you apply. Local docker: `DATABASE_SSL=disable`.

---

## 3. RDS-native bootstrap of the first real client

Script: [`scripts/bootstrap-real-client.ts`](../../scripts/bootstrap-real-client.ts).  
`npm run bootstrap-real-client` is the same command.

Idempotent. Re-runs skip an existing client name or reviewer email. Schema first (step 2). `--dry-run` writes nothing. With no database env, `--dry-run` prints the plan and does not connect.

Use a business contact. Do not put a member name, DOB, or clinical text in these flags.

```bash
ENABLE_AWS_DB=true DATABASE_URL=postgres://... \
  npm run bootstrap-real-client -- --dry-run \
  --client-name "Acme TPA" \
  --contact-email ops@acme.example \
  --lpn-name "Pat LPN" --lpn-email pat@vantaum.example \
  --rn-name "Sam RN" --rn-email sam@vantaum.example \
  --md-name "Dr. Jamie Smith" --md-email jamie@vantaum.example \
  --md-specialty "Internal Medicine"
```

Read the plan. Then run the same command **without** `--dry-run`.

Local docker adds `DATABASE_SSL=disable`. `ENABLE_AWS_DB` left false is the leftover Supabase JS client — do not use that path for the RDS go-live.

Synthetic demo rows (still not live PHI):

```bash
ENABLE_AWS_DB=true DATABASE_URL=postgres://... npx tsx scripts/seed-demo.ts --dry-run
```

---

## 4. Synthetic → shadow → hypercare

Operator detail for A–E is [`11-cole-onboarding-runbook.md`](11-cole-onboarding-runbook.md). UI: `/admin/onboarding`. Do not skip A (BAA artifact) because this step is numbered 4.

| Gate | Where | Command / click |
|------|--------|-----------------|
| A Commercial & legal | Runbook phase A, checklist A1–A5 | Check items on `/admin/onboarding`. A2 BAA is the hard gate |
| B `client_config` | Runbook phase B | `POST /api/client-config` with the synthetic fixture, then the real tenant’s non-PHI config |
| C Access | Runbook phase C | Users and roles. Cognito only after step 1 flipped `ENABLE_AWS_AUTH` |
| D Connectivity | Runbook phase D | One primary intake. Gravity Rail HMAC from step 1 if that is the intake |
| E1 Synthetic ≥10 | Runbook phase E | `npm run test:go-live-synthetic` or “Run synthetic pack” |
| E2 Shadow ≥10 | Runbook phase E | `npm run test:shadow-golive-pack` or `POST /api/golive/shadow`. `member_provider_final_sends` must be `0` |
| E3 Hypercare first 25 | `/cx` scorecard | Full fan-out only after step 6. MD signs every determination |
| E4 Rollback | Runbook E4 | If first-25 SLA miss rate exceeds `sla_miss_rollback_threshold` (default `0.2`), pause live intake and stay on shadow |

Fixture how-to: [`fixtures/golive/README.md`](../../fixtures/golive/README.md). Tokenized refs only (`memb_synth_*`).

---

## 5. BAA / HIPAA checklist

Work the gates in [`06-hipaa-baa-path.md`](06-hipaa-baa-path.md). Minimum before any live PHI case:

1. Executed client BAA + required subprocessor BAAs (runbook A2, A3). Artifact: `clients/{id}/baa.pdf`.
2. AWS path actually deployed with the flags from step 1 (`ENABLE_AWS_DB`, `ENABLE_AWS_STORAGE`, `ENABLE_AWS_EMAIL`, and `ENABLE_AWS_AUTH` for that tenant).
3. SES identity verified; sandbox exit or a production identity that can send.
4. Secrets in SSM / Secrets Manager, not in git.
5. Encryption in transit and at rest confirmed; access logging on.
6. Retention, backup restore tested once, breach contacts written.
7. No PHI in tickets, Slack, agent chats, email subjects, or Muse payloads.

Vendors (Meow, HelloSign, Phaxio, Gravity Rail, Muse): production keys only after the BAA/DPA that covers that vendor. Empty slots stay dark.

---

## 6. No live PHI until the BAA path is confirmed

Do not flip `client_config.go_live_mode` to `live` with real member data until step 5 is signed off by Cole and legal.

Until that sign-off:

- Synthetic and shadow packs only.
- Muse stays unkeyed.
- Gravity Rail may be keyed for a workspace only if that workspace is not carrying live PHI.
- Determination email, fax, and portal downloads stay on synthetic cases.

Checking a box in `/admin/onboarding` is an ops gate. It does not mean HIPAA is complete.

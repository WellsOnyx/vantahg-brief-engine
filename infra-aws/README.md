# infra-aws

AWS CDK for the VantaUM app target (`app.vantaum.com`). Marketing stays on Vercel.

The application at the repo root is one codebase. Vendor glue lives in
`lib/adapters/*` and `lib/db/*` and switches on `ENABLE_AWS_*`.

## What is real vs staged

| Stack | Status | Notes |
|-------|--------|--------|
| Database | Real CDK | VPC + RDS Postgres 15 + Secrets Manager. Apply SQL with `npm run db:migrate:rds`. |
| Storage | Real CDK | KMS + 3 buckets. Compute grants the task role read/write + encrypt. |
| Email | Real CDK | SES config set + SNS + suppressions table. Domain verification is manual. App uses `SesEmailAdapter` when `ENABLE_AWS_EMAIL=true`. |
| Auth | Deployed, **not cut over** | Cognito + magic-link Lambdas exist. App default is Supabase Auth (`ENABLE_AWS_AUTH=false`). |
| Compute | Real CDK | Fargate + ALB + bastion. Wires `ENABLE_AWS_DB/STORAGE/EMAIL=true`. Auth flag stays false unless you export `ENABLE_AWS_AUTH=true` at deploy. |
| Cron | Real CDK | EventBridge → Lambda → ALB `/api/cron/*`. |
| Build | Optional | Instantiated only when `VANTAUM_GITHUB_CONNECTION_ARN` is set. `cdk synth` works without it. |

Do not treat Cognito as production auth. That is a later wave.

## Operator bootstrap (no secrets in git)

1. **Database.** `cdk deploy vantaum-<env>-database`
2. **Schema.** From a host that can reach Postgres (bastion or local docker):

   ```bash
   # Local
   docker compose -f docker-compose.postgres.yml up -d
   DATABASE_URL=postgres://vantaum:localdev@127.0.0.1:5432/vantaum \
     DATABASE_SSL=disable npm run db:migrate:rds

   # RDS via bastion: set DB_* from vantaum-<env>-db-admin-credentials, then
   npm run db:migrate:rds
   ```

3. **Storage + email.** `cdk deploy vantaum-<env>-storage vantaum-<env>-email`
4. **Compute.** Fill `vantaum-<env>-third-party-keys` via CLI (not Console plaintext — it has duplicated keys before). Then `cdk deploy vantaum-<env>-compute`.
5. **Verify.** `GET /api/health` should show `"database":"connected"` and `"backends":{"db":"rds","storage":"s3","email":"ses","auth":"supabase"}`.

Minimum env on the task (already wired in ComputeStack):

- `ENABLE_AWS_DB=true` + `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` from the RDS secret
- `ENABLE_AWS_STORAGE=true` + `AWS_S3_BUCKET_PREFIX=vantaum-<env>-`
- `ENABLE_AWS_EMAIL=true` + `SES_FROM_ADDRESS` (identity must be verified or sends fail closed)
- `CRON_SECRET` in the third-party secret
- Third-party slots (Anthropic, Phaxio, …) stay empty until that vendor is actually provisioned

## Local CDK

```bash
cd infra-aws
npm install
npx cdk synth          # no GitHub connection required
npx cdk diff
npx cdk deploy vantaum-prod-database
```

`cdk.json` + `bin/vantaum.ts` are the entrypoint. Account/region come from
`CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` (default `us-east-1`).
Environment name: `VANTAUM_ENV` (default `prod`).

## Migration sequencing

Same order as before: RDS → S3 → SES → (Cognito later) → Fargate. Details in
`STATE.md` and `docs/aws-migration.md`.

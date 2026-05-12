# infra-aws

AWS CDK stack for the VantaUM AWS deployment target.

**This is a parallel deployment target, not a fork.** The application
code at the repo root deploys to Vercel today and will deploy to AWS
when this stack is finished. The vendor-specific glue lives in
`lib/adapters/*` and switches based on `ENABLE_AWS_*` env vars.

## Status

Stubbed. None of the resources are provisioned yet. This directory exists
so the migration target is committed alongside the code that depends on
it, and Cole can pick up exactly where we left off without guessing at
intent.

## Stack outline

What this CDK stack will provision (one stack per environment):

| Component | Resource | Replaces |
|-----------|----------|----------|
| Database | RDS Postgres (Multi-AZ, t4g.medium) | Supabase Postgres |
| Auth | Cognito User Pool + custom-auth Lambdas | Supabase Auth |
| File storage | S3 buckets (one per logical bucket) | Supabase Storage |
| Email | SES configuration set + suppression DynamoDB | Supabase SMTP / nodemailer |
| Compute | ECS Fargate service (Next.js standalone) | Vercel |
| Cron | EventBridge scheduled rules → Lambda → existing /api/cron routes | Vercel Cron |
| Secrets | AWS Secrets Manager | Vercel env vars |
| Logs | CloudWatch Logs + metrics | Vercel runtime logs |
| Observability | Sentry stays as-is (vendor-neutral) | — |

## Migration sequencing (Cole's playbook)

When you're ready to start, the recommended order:

1. **RDS first.** Provision the database, run all migrations against it,
   import data from Supabase via `pg_dump`. Leave the app pointing at
   Supabase Postgres — verify the data shape is identical with a
   read-only canary.

2. **S3 next.** Stand up the buckets, run `aws s3 sync` from Supabase
   Storage to S3. Flip `ENABLE_AWS_STORAGE=true` per environment. Old
   uploads land in S3; in-flight downloads need a back-compat path or
   a one-time backfill. The adapter shape gives you both — see
   `lib/adapters/storage/s3.ts` notes.

3. **Email third.** Easiest hop: SES via SMTP (no code changes, just
   point `SMTP_HOST` at SES). Worry about the SDK adapter later.

4. **Cognito fourth.** The hardest piece. Plan ~3 days for the magic-
   link custom-auth flow. Notes in `lib/adapters/auth/cognito.ts`.
   Migrating existing Supabase auth users requires their email + you
   issue a one-time reset; there's no password-hash export.

5. **ECS/Fargate last.** Container the Next.js app (output: standalone),
   push to ECR, run behind ALB. The cutover is a DNS flip from Vercel
   to ALB.

## Local dev

You won't run AWS resources locally during normal development. The
adapters fall back to Supabase/SMTP/etc. when their `ENABLE_AWS_*`
flags are absent. CDK is only invoked when you're deploying or
testing infra changes.

```bash
cd infra-aws
npm install
npx cdk synth   # render CloudFormation
npx cdk diff    # show what would change vs deployed
npx cdk deploy  # apply (requires AWS creds + bootstrap)
```

## What lives here

- `bin/vantaum.ts` — CDK app entrypoint. One per environment.
- `lib/database-stack.ts` — RDS + secrets.
- `lib/storage-stack.ts` — S3 buckets.
- `lib/auth-stack.ts` — Cognito + Lambdas.
- `lib/compute-stack.ts` — Fargate service, ALB, ECR.
- `lib/email-stack.ts` — SES + DynamoDB suppressions.
- `lib/cron-stack.ts` — EventBridge schedules.

All currently stubbed with the interface scaffolding only — see the
file comments for what to fill in.

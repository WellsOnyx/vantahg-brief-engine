# VantaUM AWS Migration - Status

**Last update:** 2026-05-13 (overnight session)
**Account:** 309921834034 (us-east-1)
**Cost running:** ~$30/month idle (~$20 RDS, ~$3 bastion, rest pay-per-use)

## What's live in AWS

| Stack | Resources | Status |
|---|---|---|
| vantaum-prod-storage | 4 S3 buckets (KMS-encrypted) + access logs | ✅ Live |
| vantaum-prod-database | VPC (10.10.0.0/16), RDS Postgres 15 t4g.micro | ✅ Live |
| vantaum-prod-email | SES config set, SNS bounce topic, suppression DDB | ✅ Live |
| vantaum-prod-auth | Cognito User Pool + 3 magic-link Lambdas + OTP DDB | ✅ Live |
| vantaum-prod-compute | ECR, ECS cluster, Fargate service (nginx placeholder), ALB, SSM bastion | ✅ Live |
| vantaum-prod-cron | EventBridge schedule (1 min) → cron Lambda → ALB | ✅ Live |

**ALB DNS:** `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com`
**ECR repo:** `309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app`
**Bastion instance:** `i-0ac7f36a48ac8aacc`
**RDS endpoint:** `vantaum-prod-database-databaseb269d8bb-iruufzdfjweg.c4vqceyuu67e.us-east-1.rds.amazonaws.com:5432`

**BAA active in AWS Artifact** — account is HIPAA-eligible.

## Docker image

- Built: `vantaum-app:latest` (358MB, ARM64)
- Pushed to ECR with tags `v1` and `latest`
- Fargate service is currently running the nginx placeholder, NOT this image, until DB migrations and env-var wiring are finalized

## Database migrations status

Ran migrations 000-016 against RDS via SSM-on-bastion. **Partial success — 18 tables created.**

### Tables that landed cleanly
appeals, audit_log, cases, clients, contract_templates, contracts, determination_templates, efax_queue, email_queue, intake_log, missing_info_requests, peer_to_peer_records, pod_lpns, pods, quality_audits, reviewers, signup_requests, staff

### Migrations that failed (need fix)
1. **`001_auth_rls.sql`** — references `auth.uid()` which doesn't exist on RDS (Supabase-specific). Per `docs/aws-migration.md`, replace with `current_setting('vantaum.user_id', true)::uuid` and set the GUC in Next.js middleware. `user_profiles` table is defined here, so other migrations cascade from this fix.
2. **`006_hipaa_intake.sql`, `007_email_intake.sql`** — use `CREATE POLICY IF NOT EXISTS` which isn't valid Postgres syntax. Fix: replace with `DROP POLICY IF EXISTS ... CREATE POLICY ...`.
3. **`011_expanded_roles.sql`, `012_signup_requests.sql`, `014_contract_generator.sql`, `016_delivery_org.sql`** — cascade failures from 001. The new role check constraint + `get_user_role()` function are missing. Re-apply after 001 lands.
4. **`013_signup_contracts_bucket.sql`** — references `storage.buckets` (Supabase Storage table). Skip entirely — buckets are in S3 now, no DB row needed.

## Tomorrow's order of operations

### 1. Fix migrations (highest priority)
- Hand-port `001_auth_rls.sql` for RDS:
  - Remove `auth.uid()` references, replace with session GUC reads
  - Remove `storage.*` schema dependencies
  - Keep `user_profiles` table + `get_user_role()` function definitions
- Fix `IF NOT EXISTS` syntax in 006 and 007
- Skip 013 (S3 buckets handle this)
- Re-run failed migrations against RDS via the bastion using the same SSM pattern that worked tonight

### 2. Wire app env vars + secrets
The Fargate task needs:
- `DATABASE_URL` — built from `vantaum-prod-db-admin-credentials` secret
- `AWS_REGION=us-east-1`
- `COGNITO_USER_POOL_ID=us-east-1_CjZbn5TD4`
- `COGNITO_CLIENT_ID=4v19mdtmaa8ubns3d6bsi4t2i7`
- `ENABLE_AWS_STORAGE=true`
- `ENABLE_AWS_AUTH=true`
- `ENABLE_AWS_EMAIL=true`
- `SES_FROM_ADDRESS=noreply@vantaum.com`
- `HELLOSIGN_API_KEY`, `ANTHROPIC_API_KEY`, etc. — port from Vercel env vars; store in Secrets Manager
- `CRON_SECRET` — from `vantaum-prod-cron-secret` secret

Most cleanly: add a Secrets Manager secret with all the third-party API keys as JSON, mount as env vars on the Fargate task.

### 3. Swap placeholder image for real image
Once env is wired and migrations are clean:
```
cd infra-aws
REAL_IMAGE_TAG=v1 AWS_PROFILE=vantaum ./node_modules/.bin/cdk deploy vantaum-prod-compute
```
This redeploys the Fargate task definition with the real container image. Service does a rolling update.

### 4. Verify Fargate is healthy
- `curl http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health` should return 200
- Check CloudWatch logs at `/vantaum/prod/app`
- If failing, ECS Exec into the container via SSM: `aws ecs execute-command --cluster vantaum-prod --task <task-id> --container app --command "/bin/sh" --interactive`

### 5. Domain + HTTPS (manual)
- Add `app.vantaum.com` DNS record pointing at the ALB
- Request ACM cert for `app.vantaum.com` (DNS validation via Route 53)
- Add HTTPS listener to the ALB pointing at the same target group, redirect HTTP→HTTPS

### 6. SES domain verification (manual)
- AWS Console → SES → Verified identities → Create identity
- Domain: `vantaum.com`
- DKIM mode: Easy DKIM
- Add the provided CNAME records to vantaum.com DNS
- Wait for verification (~5 min)
- File support ticket for sandbox exit (24-48h)

### 7. Data backfill (when ready to switch)
- `pg_dump --data-only` from Supabase, restore to RDS
- `aws s3 sync` Supabase Storage → S3 buckets
- Validate row counts match

### 8. DNS cutover
- Set `app.vantaum.com` to point at the AWS ALB (currently nowhere)
- Leave Vercel app deploy running for 30 days as fast rollback

## How to SSH-into-the-bastion equivalent

Need to run a SQL one-off or check something? Don't try to install session-manager-plugin (requires sudo).
Instead, use `aws ssm send-command`:

```bash
aws ssm send-command \
  --profile vantaum --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids i-0ac7f36a48ac8aacc \
  --parameters 'commands=["psql -c \"SELECT COUNT(*) FROM cases\""]'
```

Then poll for the result:
```bash
aws ssm get-command-invocation \
  --profile vantaum --region us-east-1 \
  --command-id <ID> --instance-id i-0ac7f36a48ac8aacc
```

## Known gotchas hit + lessons

1. **Em-dashes in CDK descriptions** — AWS rejects them as non-printable control characters. Use plain hyphens.
2. **ECR `tagPrefixList: ['']` is invalid** — use `tagStatus: ANY` to apply to all images.
3. **Cross-stack security group ingress** creates dependency cycles. Use `CfnSecurityGroupIngress` from the dependent side instead of `addIngressRule` on the imported SG.
4. **KMS access requires BOTH the IAM policy on the role AND the key policy.** Our key has root principal, so IAM-only is fine. If you ever switch to per-service key access, update the key policy too.
5. **Next.js standalone output inside git worktrees** puts `server.js` under the absolute path. Set `outputFileTracingRoot` in `next.config.ts` to fix.
6. **CDK output dir conflicts** if you run multiple `cdk` commands in parallel from the same `infra-aws/` directory. Serialize them.

## Resume command to start tomorrow

```bash
cd ~/vantahg-brief-engine/.claude/worktrees/pensive-wu-c34d54
git pull origin main
cd infra-aws
AWS_PROFILE=vantaum ./node_modules/.bin/cdk list
```

That last command should print all six stacks. If it does, you're good to go.

# RDS-flavored migrations

These are the AWS-side counterparts to migrations in `../../supabase/migrations/`
that needed hand-porting because they used Supabase-specific features
(`auth.uid()`, `auth.jwt()`, `auth.users` references, `CREATE POLICY IF NOT EXISTS`,
`storage.buckets`, etc.).

## Apply order (after running supabase/migrations/000-016 against RDS)

The originals already created 18 of the 22 expected tables. These files
finish what couldn't be ported automatically.

1. `001_auth_rls.sql` — user_profiles + get_user_role() + RLS policies
2. `006_hipaa_intake_policies.sql` — fix CREATE POLICY IF NOT EXISTS
3. `007_email_intake_finish.sql` — same fix + the missing allowed_sender_domains table
4. Re-run originals that cascade-failed:
   - `../../supabase/migrations/011_expanded_roles.sql`
   - `../../supabase/migrations/012_signup_requests.sql`
   - `../../supabase/migrations/014_contract_generator.sql`
   - `../../supabase/migrations/016_delivery_org.sql`

The original `013_signup_contracts_bucket.sql` is skipped entirely on
AWS - it inserts into Supabase's `storage.buckets` table, which doesn't
exist on RDS. S3 handles bucket configuration via CDK in StorageStack.

## How to apply via bastion

```bash
aws s3 sync infra-aws/rds-migrations/ s3://vantaum-prod-public-assets/rds-migrations/ --profile vantaum
aws s3 sync supabase/migrations/ s3://vantaum-prod-public-assets/supabase-migrations/ --profile vantaum

aws ssm send-command \
  --profile vantaum --region us-east-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids i-0ac7f36a48ac8aacc \
  --parameters file://infra-aws/rds-migrations/run.json
```

(Or hand-build the parameter; see how `scripts/apply-rds-migrations.sh`
does it once that lands.)

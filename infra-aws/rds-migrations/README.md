# RDS-flavored migrations

AWS-side counterparts to `../../supabase/migrations/` where the original
used Supabase-only features (`auth.uid()`, `auth.users` FKs,
`CREATE POLICY IF NOT EXISTS`, `storage.buckets`).

**Do not apply files by hand in random order.** Use the catalog:

```bash
npm run db:migrate:rds:dry      # print plan
npm run db:migrate:rds          # apply pending
npm run db:migrate:rds:status   # applied vs pending
```

The runner (`scripts/apply-rds-migrations.mjs`) plus
`lib/db/rds-migrations.ts`:

1. Applies `000_rds_bootstrap.sql` first (auth-compat schema + `schema_migrations`).
2. For each numeric prefix 000–026, prefers an RDS file when one exists,
   otherwise the portable supabase file.
3. Skips `013_signup_contracts_bucket.sql` (Supabase Storage). S3 is CDK.

Connection: `DATABASE_URL` or `DB_HOST`+`DB_PASSWORD` (same as `lib/db/pool.ts`).
Local docker: `DATABASE_SSL=disable`.

## Hand-ported files (why they exist)

| File | Why not the supabase original |
|------|-------------------------------|
| `000_rds_bootstrap.sql` | `auth` schema, `auth.uid()`/`auth.jwt()`, ledger table |
| `001_auth_rls.sql` | No FK to `auth.users`; session GUCs |
| `006_hipaa_intake_policies.sql` | `CREATE POLICY IF NOT EXISTS` is invalid on PG 15 |
| `007_email_intake_finish.sql` | Same + `allowed_sender_domains` |
| `016_delivery_org.sql` | Soft uuid pointers instead of `auth.users` FKs |
| `019_practices.sql` | Same |
| `020`–`026` | Applied on RDS already; kept next to the runner |

## Bastion (production RDS)

Still valid if you need to copy SQL onto the instance. Prefer the Node
runner from a jump host that can reach 5432:

```bash
# After SSM port-forward or from the bastion itself
export DB_HOST=... DB_USER=vantaum_admin DB_PASSWORD=... DB_NAME=vantaum
npm run db:migrate:rds
```

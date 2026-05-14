# Database backend wiring — decision doc

**Problem:** `app.vantaum.com` boots into demo mode because
`NEXT_PUBLIC_SUPABASE_URL` is an empty string in the
`vantaum-prod-third-party-keys` secret and `ENABLE_AWS_DB` is not
wired in `infra-aws/lib/compute-stack.ts`. Result: `hasSupabaseConfig()
=== false`, `isDemoMode() === true`, every DB-backed route returns
deterministic stubs. The `e1615ed` auth-guard fix now 401s those
routes in prod demo mode, so the symptom is "all admin routes are
unreachable" rather than "anyone is admin" — better failure mode,
same root cause.

This doc captures the two options for leaving demo mode and a
recommendation.

---

## Option A — Wire `ENABLE_AWS_DB=true`, route through the pg shim to RDS

The shim (`lib/db/supabase-shim.ts`) is already coded and validated.
`scripts/validate-rds-shim.mjs` runs 14 end-to-end patterns against
live RDS via the bastion. 18 SQL-generation unit tests in
`__tests__/lib/db/supabase-shim.test.ts`. RDS has migrations 000–020
applied (019/020 landed in `e1615ed`) so the schema matches what
the app expects.

### Tradeoffs

**Pros**
- Uses infrastructure we already paid for. RDS is sitting idle.
- Same AWS account, BAA-covered, KMS-encrypted at rest.
- Latency between Fargate and RDS in the same VPC is sub-millisecond.
- No data shared with Supabase post-cutover. Cleaner HIPAA story.
- Schema is current — migrations 019/020 are on RDS and not on
  Supabase yet (per `infra-aws/rds-migrations/README.md`).
- One less external dependency.

**Cons**
- RDS is empty. Existing Supabase users, signups, cases — none of
  it is on RDS. First customer onboarded post-cutover would not see
  anything from the pre-cutover Supabase data. Acceptable today
  because there are no real customers, but the window is closing.
- Auth still goes to Supabase Auth in V1 hybrid mode. `lib/supabase.ts`
  line 19–22: `createServerClient()` always returns the real Supabase
  SSR client because the shim doesn't implement `auth.getUser` /
  `auth.admin`. So `ENABLE_AWS_DB=true` does NOT let us drop the
  Supabase Auth dependency — that's a separate Cognito-cutover wave.
  **The Supabase auth keys still need to be filled** (or we 401 every
  authenticated request).
- One CDK deploy required to add the env flag + restart tasks.
- Shim has been validated but has not run real production traffic.
  Any unsupported method in a less-trodden code path will throw at
  request time. Mitigation: existing test coverage plus the
  validate-rds-shim script.

### What you'd actually change

A new env var on the task container, plus three Supabase auth-only
secrets that need to be populated separately.

`infra-aws/lib/compute-stack.ts` — see CDK diff at the bottom of this
doc. Adds `ENABLE_AWS_DB: 'true'` to the `environment` block. The
`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` secrets are already wired
from `dbSecret` (lines 178–182 in current `compute-stack.ts`) so the
pg pool will pick them up automatically.

Then separately, fill these three keys in `vantaum-prod-third-party-keys`
(NOT in CDK — via `aws secretsmanager put-secret-value` from a tmp
file, the pattern described in STATE.md's Meow bootstrap section):
- `supabase_url`
- `supabase_anon_key`
- `supabase_service_role_key`

Without those, `createServerClient()` will throw on every
authenticated route and the app will still effectively be down — just
with a different error.

---

## Option B — Fill Supabase keys in the secrets vault, keep the app on Supabase Postgres

`vantaum-prod-third-party-keys` has three empty slots: `supabase_url`,
`supabase_anon_key`, `supabase_service_role_key`. Filling them with
the live Supabase project values would leave `ENABLE_AWS_DB` unset
(default behavior), so the app boots talking to Supabase Postgres
the same way the Vercel deploy did.

### Tradeoffs

**Pros**
- No CDK change. `aws secretsmanager put-secret-value` + a
  `--force-new-deployment` and you're done. ~15 minutes vs ~45.
- Data continuity. Whatever signups/cases/clients are on Supabase
  today carry forward without a migration.
- Battle-tested code path. The Vercel deploy used this exact backend
  for months.
- Schema on Supabase is at 018 (no 019/020 yet — those are RDS-only
  for now). **This is a hidden gotcha:** the portals and Meow code
  on `main` reference `practices`, `practice_users`, `meow_*`
  columns that don't exist on Supabase. Those features would 500
  on Supabase until 019/020 are also applied there.

**Cons**
- RDS continues to sit idle costing ~$15/mo for nothing.
- Two databases of record while we transition. Confusing.
- HIPAA story relies on Supabase BAA + AWS BAA both being current.
- Doesn't make progress on the eventual "drop Supabase Postgres"
  goal — every day on this path is rework deferred.
- Need to apply migrations 019/020 to Supabase before portals work.
  That's ~5 extra minutes and a new SQL file
  (`supabase/migrations/019_practices.sql` already exists for
  Supabase — verify it's actually been run; the RDS variant existed
  because Supabase's auth.* references made the file non-portable).

---

## Recommendation: Option A

The shim has more tests behind it than any production code path
deserves, RDS is current, and we have no real customer data to
preserve. The honest answer to "why are we still on Supabase
Postgres" today is inertia, and the longer we delay the cutover the
more expensive the eventual data migration gets.

Option B is the right answer only if (a) we have real customer data
on Supabase that we can't afford to leave behind, or (b) we believe
the shim hides a latent bug. Neither is true right now.

The Supabase-Auth-still-needed caveat is real but it isn't
unique to either option — V1 hybrid mode requires those keys
filled regardless. Treat that as a separate task: fill three
Supabase Auth secrets either way.

---

## CDK diff for `infra-aws/lib/compute-stack.ts`

Add one line to the `environment` block of the app container
(currently lines 157–173 in `compute-stack.ts`). Place it next to
the other `ENABLE_AWS_*` flags so the pattern is consistent.

```diff
       environment: {
         NODE_ENV: 'production',
         PORT: String(containerPort),
         // AWS adapter flags - the app routes through S3 / Cognito / SES.
         ENABLE_AWS_STORAGE: 'true',
         ENABLE_AWS_AUTH: 'true',
         ENABLE_AWS_EMAIL: 'true',
+        // Route DB calls through the pg shim against RDS instead of
+        // Supabase Postgres. lib/supabase.ts:27 reads this flag and
+        // substitutes PgShimClient. Auth (auth.getUser) still routes
+        // to Supabase Auth in V1 — see lib/supabase.ts:19-22.
+        ENABLE_AWS_DB: 'true',
         ENABLE_REAL_ANTHROPIC: 'true',
         ENABLE_REAL_HELLOSIGN: 'true',
         ENABLE_REAL_EFAX: 'true',
         // App URL and SES sender (must be SES-verified domain).
         NEXT_PUBLIC_SITE_URL: 'https://app.vantaum.com',
         APP_URL: 'https://app.vantaum.com',
         SES_FROM_ADDRESS: 'noreply@vantaum.com',
         // Region for AWS SDK clients.
         AWS_REGION: this.region,
       },
```

No other compute-stack changes needed. The RDS connection secrets are
already wired (lines 178–182):

```typescript
DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, 'port'),
DB_NAME: ecs.Secret.fromSecretsManager(dbSecret, 'dbname'),
DB_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
```

`lib/db/pool.ts` reads `DB_HOST` / `DB_PORT` / etc. directly.

---

## Sequencing with the container rebuild

The CDK change here and the container rebuild are independent but both
touch `vantaum-prod-compute`. Do them in this order:

1. Container rebuild (`docs/container-rebuild-2026-05-13.md`) →
   `REAL_IMAGE_TAG=v3 cdk deploy vantaum-prod-compute`.
2. Verify v3 is healthy on prod.
3. Apply this diff to `compute-stack.ts`, commit on a feature branch.
4. Fill the three Supabase Auth secrets via CLI.
5. `cdk deploy vantaum-prod-compute` again (no `REAL_IMAGE_TAG` change,
   just the new env var).
6. `aws ecs update-service --force-new-deployment`.
7. `curl https://app.vantaum.com/api/health` — expect
   `"database":"connected"` (not `"demo_mode"`).

Two CDK deploys instead of one is intentional — keeps each blast
radius small. If step 5 fails, step 2 is still the last known good
state.

---

## Verification

```bash
# After deploy + redeploy:
curl https://app.vantaum.com/api/health
# Expect: {"status":"healthy","database":"connected", ...}

# Hit an authenticated route that requires a real query:
curl -i -H "Authorization: Bearer <test session token>" \
  https://app.vantaum.com/api/admin/signups
# Expect: 200 with a JSON array (possibly empty — RDS has 0 signups)
# NOT 401 with auth_failure, NOT 500 with shim error
```

If the response is `database: "demo_mode"` after this work:
- Re-check `ENABLE_AWS_DB` actually made it onto the task definition
  (`aws ecs describe-task-definition`)
- Check the three Supabase auth secrets are non-empty in the vault
  (`aws secretsmanager get-secret-value` and `jq` the result)

If 500 with a shim error message:
- The route is using a Supabase method the shim doesn't implement
- Add the method to the shim with a test, do NOT bypass with raw SQL
- File a follow-up issue; rolling back to Supabase Postgres via
  unsetting `ENABLE_AWS_DB` is the safe fallback

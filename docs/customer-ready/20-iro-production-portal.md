# 20 — Production IRO portal

**Date:** 2026-10-20
**Direction:** Jonah. Stop the public demo. Ship the authenticated IRO portal on the AWS account that is already up. BAAs are already in place. Do not design new infrastructure.

## What this is

`/portal` is the staff sign-in for the IRO desk. `/portal/iro` is the case desk. `/portal/status` is still the Authorization Status Portal and still requires a session.

Roles: intake, case manager, reviewer, approver, admin. They map onto the SOP roles the workflow already enforces (`iro_coordinator`, `iro_physician`, `iro_medical_director`, `iro_team_lead`). Reviewers only read cases assigned to them. IDR and Medical Review actors are not granted the IRO line.

Every case read and write appends `iro_case_audit`. The audit row stores actor, action, code, step, and version. It does not store a patient name or member id.

MFA uses the existing Cognito user pool (SMS and software OTP, already optional on the pool). The portal reads the ID token `amr` claim. `IRO_PORTAL_MFA_REQUIRED=true` refuses a session that has not completed a factor. That flag ships unset.

## Live intake

`LIVE_PHI_ENABLED` defaults off. Real create and document upload return `403 live_phi_disabled` until it is `true`.

The BAA is config, not a signing step. Unset `AWS_BAA_SIGNED` means the existing AWS BAA stands. `AWS_BAA_SIGNED=false` revokes intake.

The gate also requires the flags that already select RDS and S3:

- `ENABLE_AWS_DB=true` and `DATABASE_URL` or `DB_HOST`
- `ENABLE_AWS_STORAGE=true`

## Where records live

No new account, bucket, or KMS key.

| Data | Existing resource |
|---|---|
| Cases, deadlines, assignments, determinations, audit, credential state, staff grants | RDS database `vantaum`, migration `infra-aws/rds-migrations/033_iro_portal.sql` |
| PDF originals | S3 bucket `vantaum-<env>-efax-documents` (`AWS_S3_BUCKET_PREFIX` + `efax-documents`) |
| Encryption at rest | Bucket default SSE-KMS, key alias `alias/vantaum-<env>-storage` (StorageStack). Objects do not set a different key. |
| Encryption in transit | Bucket policy denies non-TLS. The S3 client uses HTTPS. |
| Download | Signed URL, 5 minutes, private bucket, block-public |
| Sign-in | Existing Cognito pool (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`) when `ENABLE_AWS_AUTH=true` |

Apply the migration with `npm run db:migrate:rds` against that database. Do not create a bucket.

Assignment calls `evaluateAssignment` in `lib/credentialing` (the shared record from the open credentialing work). An expired, lapsed, restricted, or unactivated reviewer is refused. The portal does not send mail. Delivery is recorded on the in-memory mailing adapter (`live_call: false`). Fee amounts are not rendered.

## New env Cole sets to turn real intake on

Only one new variable is required:

```
LIVE_PHI_ENABLED=true
```

These already exist and must be true on that runtime or the gate still refuses:

```
ENABLE_AWS_DB=true
DATABASE_URL=...          # or DB_HOST / DB_USER / DB_PASSWORD
ENABLE_AWS_STORAGE=true
AWS_S3_BUCKET_PREFIX=vantaum-prod-
AWS_REGION=us-east-1
ENABLE_AWS_AUTH=true
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
```

Optional, not required for intake:

```
IRO_PORTAL_MFA_REQUIRED=true
AWS_BAA_SIGNED=false      # kill switch only
```

## Still open

- Shared credential writes still accept synthetic reviewer tokens (`syn-…`). A Cognito sub cannot be stored on that record until that guard is opened. Assignment of a shared record is wired.
- Notice delivery does not call SES. Someone still has to send the letter.
- No production rows are seeded.
- `LIVE_PHI_ENABLED` ships false in the repo. Production turns it on in the task environment.

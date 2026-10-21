# 21 — Med Review production hardening

VantaUM sells Med Review. IDR and IRO stay on their own doors. This change does not add infrastructure and does not set fees.

## What works in code

- **Sign up.** `POST /api/auth/sign-up` creates an unconfirmed Cognito user. `POST /api/auth/confirm` checks the email code and stamps `custom:org_role=client` and `custom:product_line=med_review`. The account has no `client_id` until an admin links the organization, so it cannot see another client's cases.
- **Sign in.** Password, magic link, SMS or authenticator MFA, and the invited-user new-password step. A wrong password and an unknown user return the same error. An unconfirmed email or a required reset is a named next step, not a dead end.
- **Session.** Id tokens still last about an hour. Middleware rotates them with the refresh token until an 8-hour absolute cap, then the user signs in again. Logout clears `vantaum_session` and best-effort revokes the Cognito access token.
- **Invites.** Admin `POST /api/team/invite`. Client invites require `client_id`. Reviewer, concierge, and medical director (`practice-lead`) invites are Med Review. `idr-attorney` is not tagged `med_review`.
- **After login.** Client → `/client`. Reviewer → `/med-review`. CX / concierge → `/cx`. Intake → `/intake`. Medical director / QA → `/quality`. Admin → `/mission-control`. IDR attorney → `/attorney/review`.
- **Queue.** `lib/med-review/pool.ts` assigns by specialty, state license, `evaluateAssignment` (line `MEDICAL_REVIEW`), daily capacity, and SLA slack. Bulk intake is idempotent on client + external id. Pages are filtered server-side in that helper; a client viewer cannot widen the filter to another tenant.
- **Sign.** A physician signs. `actor_kind: ai` cannot approve, deny, pend, or partially decide. The existing R9 medical-necessity guard still fires first on an AI medical-necessity deny.
- **Delivery.** Sign writes the immutable determination package, an audit row, and a pending fan-out. `FanoutService` delivers the portal copy, the client webhook when configured, and the billing ledger event. Amounts still come from the existing price card. Nothing here hard-codes a fee.

## Cole — apply on RDS

```bash
npm run db:migrate:rds
```

That picks up `infra-aws/rds-migrations/034_med_review_queue.sql`:

- `user_profiles.client_id`
- indexes on client + status, client + external id, SLA deadline, and open reviewer assignment

No new Cognito pool, no new bucket, no new BAA. The app client already allows `ADMIN_USER_PASSWORD_AUTH` and has no client secret, which the refresh call uses.

Set `ENABLE_AWS_AUTH=true` on the deployment that should use these routes (Vercel for vantaum.com, and Fargate if app.vantaum.com should match). Leave it unset to keep the Supabase hybrid login. `LIVE_PHI_ENABLED` stays the gate for live PHI.

## Still open

- Self-serve sign-up does not create the `clients` row or the contract. An admin still binds `client_id` (invite or profile update) before the portal lists cases.
- Reviewer assignment in `lib/assignment-engine.ts` calls the pool scorer. It does not yet load the shared credentialing store from RDS on that path; `credential_ok` follows `reviewers.status` there. The pool API accepts the boolean from `evaluateAssignment` when the caller has the record.
- Webhook URL and secret still come from the existing client config / env. An unset webhook is recorded as not configured; it does not invent a delivery.
- Medical director and QA use the existing `practice-lead` role (and the string roles `medical-director` / `qa` if Cognito sends them). There is no new role enum value.
- IRO portal and IDR attorney surfaces are unchanged and still firewalled from this line.

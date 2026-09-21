# 12 — Muse Connector Platform (Phase 8 stub)

**Status:** Code-complete foundation. **Not live-keyed. Not a PHI path.**  
**Owner:** VantaUM (CX) · **Not clinical SoR**  
**Surface:** muse.ai connector slots + `/cx` touchpoints panel

Jonah added Muse as a CX / relationship surface. Clinical system of record stays on the AWS Brief Engine (RDS, S3, SES, Cognito). This slice ships the seams so a later connector can be keyed without inventing a second case writer.

## What this is

| Allowed in Muse | Not allowed in Muse |
|-----------------|---------------------|
| Opaque `account_id` | Patient name, DOB, member id, MRN, SSN |
| Contact **role label** (`tpa_ops`, `cx_owner`, `billing_contact`, `implementation_lead`) | Email, phone, street address, NPI |
| Scheduling intent **flags** (`kickoff`, `follow_up`, `hypercare_standup`, `renewal`) | Diagnosis, clinical notes, briefs, packets, determinations, procedure codes |

No live patient data. No case content. The PHI gate is an allowlist (`lib/muse/phi-gate.ts`). Unknown keys are refused. Rejected values are not echoed and are not stored.

## What this is not

- Not a live Muse API client. `lib/muse` has no HTTP transport. `GET /api/muse/status` with a key still returns `live_call: false` / `code: stub_only`.
- Not Gravity Rail intake. Inbound case creation stays `POST /api/intake/gravity-rail`.
- Not a change to the Med Review packaging lock. **VantaUM sells Med Review.** Brief Engine / UM is free only under UM’s Vanta med-review contract. **VantaHG = IRO + IDR only.** Optum stays frozen.
- Not a HIPAA attestation. Production use of even this non-clinical surface waits on the BAA path in [`06-hipaa-baa-path.md`](06-hipaa-baa-path.md).

## Fail closed

Same rule as Gravity Rail.

| Slot | Empty means |
|------|-------------|
| `MUSE_WEBHOOK_SECRET` and `MUSE_WEBHOOK_SECRET_SECONDARY` both unset, `NODE_ENV=production` | `POST /api/muse/webhook` → **500** `webhook_secret_not_configured` |
| Those secrets unset in dev/test | Synthetic relationship payloads are accepted (unverified dev) |
| A secret is set | Raw-body HMAC-SHA256 required (`x-muse-signature` or `x-webhook-signature`, hex or `sha256=`). Primary or secondary both validate. Bad signature → **401** |
| `MUSE_API_KEY` unset | `GET /api/muse/status` → **503** `not_configured` |
| `MUSE_API_KEY` set | Status is `stub_only`. Still no outbound call |
| `MUSE_CX_ENABLED` is not `true`, or the API key is empty | `/cx` Muse panel renders the empty state. `GET /api/muse/touchpoints` returns `touchpoints: []` |

Documented only in [`.env.local.example`](../../.env.local.example). No secrets in the repo.

## Routes

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/muse/webhook` | Public HMAC (middleware exact match). Stores one relationship row or refuses it |
| `GET` | `/api/muse/touchpoints` | CX or admin. Clients **403** |
| `GET` | `/api/muse/status` | CX or admin. Fail closed without the API key |

Idempotency: `external_touchpoint_id`, else `account_id` + `contact_role`. Replay returns the same `touchpoint_id` with `idempotent: true`.

Store is process-local (`lib/muse/store.ts` on `globalThis` so the webhook and the CX read share one process). It is not a second clinical database and it does not survive a restart.

## CX panel

`/cx` aside: **Muse touchpoints** (`components/cx/MuseTouchpointsPanel.tsx`).

- Entitled only when `MUSE_CX_ENABLED=true` **and** `MUSE_API_KEY` is non-empty.
- Otherwise the empty state: “Muse is not configured.”
- When entitled and nothing has arrived: “No Muse touchpoints yet.”
- Rows show account id, role label, and which scheduling flags are on. No clinical fields.

## Acceptance

- `screenMusePayload` rejects PHI field names and does not return the value (`__tests__/lib/muse/phi-gate.test.ts`).
- Production webhook with no secret does not store (`__tests__/api/muse-routes.test.ts`).
- Status and webhook tests assert `fetch` is not called.
- Packaging lock and Gravity Rail intake are unchanged.

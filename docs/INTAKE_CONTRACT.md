# Canonical Intake Contract — v1.1

**Status: CANONICAL.** The engine (this repo) defines this contract; senders — Gravity Rail first — conform to it. This is the ONE authoritative document: v1.1 supersedes both the v1 handoff contract and the v1.0 voice-channel draft, unifying them on a single security model with two channel sections.

| | |
|---|---|
| Contract version | `1.1` |
| Channels | **A.** `POST /api/gr/webhook` (chat/sms/voice handoff — the stable external face) · **B.** `POST /api/intake/voice` (phone-channel envelope) |
| Executable twin | `lib/intake/gr-contract.ts` (schemas, signing, replay window, error codes — the routes and tests import it, so code cannot drift from this doc without a test failing) |
| Acceptance test | `scripts/gr-intake-verify.ts` (§8) — the single script both sides run |
| Owner | Core engine team. Changes require a version bump and sign-off. |

## What changed in v1.1 (and what didn't)

**Unchanged — the external face GR already has:**
- Endpoint `POST /api/gr/webhook` and the shared secret name `GR_WEBHOOK_SECRET`.
- The handoff body shape, idempotency behavior, and responses (§Channel A).

**Upgraded — one security model for every intake channel:**
- Signatures are now **timestamp-bound**: HMAC-SHA256 over `{timestamp}.{rawBody}` in `X-GR-Signature`, with `X-GR-Timestamp` and a **±300 s replay window** (§2).
- **Dual-secret rotation**: `GR_WEBHOOK_SECRET` + `GR_WEBHOOK_SECRET_SECONDARY` both validate during a rotation overlap — keys rotate with zero downtime.

**Transition window (v1 → v1.1):** the v1 scheme — plain `hex(HMAC-SHA256(secret, rawBody))` in `X-Webhook-Signature`, no timestamp — **is still accepted** while we confirm whether the GR team has built against it. If you are starting fresh, implement v1.1 only. If you already sign with v1, you keep working today, but plan the upgrade: engine-side the window is a single switch (`ACCEPT_V1_LEGACY_SIGNATURES` in `lib/intake/gr-contract.ts`), and each legacy-signed request is audit-logged so both sides can see when traffic has moved.

## 1. Transport rules (both channels)

- `Content-Type: application/json`, body is a single JSON document, UTF-8. HTTPS only.
- **Nothing case-related ever goes in the URL or query string** — no patient identifiers, no member IDs. Paths are static.
- Sign the **exact bytes you send** — serialize once, sign that string, send that string.

## 2. Authentication — HMAC-SHA256 with replay protection (v1.1)

1. Let `timestamp` = current Unix time in **seconds**, as a decimal string.
2. Compute `hex = HMAC-SHA256(secret, timestamp + "." + rawBody)` where `secret` = `GR_WEBHOOK_SECRET` (shared out-of-band).
3. Send `X-GR-Timestamp: {timestamp}` and `X-GR-Signature: sha256={hex}` (lowercase hex; the `sha256=` prefix is canonical, bare hex accepted).

The timestamp is inside the signed content, so the header cannot be altered without invalidating the signature. Timestamps more than **300 seconds** from the engine's clock are rejected (`replay_rejected`).

### 2.1 Worked example (verify byte-for-byte)

```
secret     = whsec_c4n0n1cal_example_do_not_use
timestamp  = 1751810400
body (308 bytes, exactly, no trailing newline):
{"contract_version":"1.1","submission_id":"gr-sub-000001","intake_channel":"phone","event":"intake.completed","from_number":"+14155550100","chat_id":12345,"transcript":"Patient John Smith, DOB 03/14/1975, member ID ABC123456, requesting prior auth for CPT 27447 total knee arthroplasty with Dr. Alan Grant."}

v1.1:  X-GR-Timestamp: 1751810400
       X-GR-Signature: sha256=d8046838367c1e42d2382b68525ecf20a270ddf55b303b8de6bb998ab385a21f

v1 legacy (transition window only):
       X-Webhook-Signature: 4aadd001447bda47820cd89bc2436f9436dc6173eafceab4ee82e06b0d9937b5
```

Node.js reference:

```js
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
// send:  X-GR-Timestamp: <timestamp>   X-GR-Signature: sha256=<sig>
```

Both vectors are pinned by unit tests (`__tests__/api/intake-voice.test.ts`) — if verification ever changes, a test breaks before this doc lies.

### 2.2 Secret rotation (zero downtime)

1. Core sets the new secret in `GR_WEBHOOK_SECRET_SECONDARY`. Both old and new now validate.
2. GR flips its signer to the new secret. No failed deliveries at any point.
3. Core moves the new secret to primary and clears the secondary slot.

(The legacy env name `GRAVITY_RAIL_WEBHOOK_SECRET` is still honored engine-side while environments standardize; treat `GR_WEBHOOK_SECRET` as the name.)

### 2.3 Misconfiguration behavior

A production deployment with **no** webhook secret configured refuses intake — Channel A returns `500 webhook_secret_not_configured`, Channel B returns `503 not_configured`. Neither ever accepts unsigned traffic in production.

---

## Channel A — `POST /api/gr/webhook` (chat / sms / voice handoff)

Called when a Gravity Rail intake chat reaches handoff. The engine turns it into a VantaUM case via the shared intake chassis. **This endpoint's body, idempotency, and responses are unchanged from v1** — only the signature scheme upgraded (§2).

### A.1 Request body

```jsonc
{
  "event": "chat.handoff",         // or "chat.completed"
  "chat_id": 84213,                // stable per chat; used as idempotency key if no header
  "workspace_id": "ws_abc123",     // REQUIRED — maps to the concierge's staff.gr_workspace_id
  "workflow_id": 12,               // optional
  "member": { "email": "m@x.com", "name": "M. Santos" },  // optional
  "transcript": "…",               // optional; string or array
  "field_values": { },             // optional; structured fields from the GR assistant
  "from_number": "+1…",            // optional
  "title": "MRI lumbar prior auth" // optional
}
```

**Required:** `workspace_id`, and one of (`Idempotency-Key` header | `chat_id`).

### A.2 Idempotency — exactly-once

GR delivery is at-least-once (retries happen). Send an **`Idempotency-Key`** header, or include a stable **`chat_id`** (the header wins if both are present). The case is keyed `GR-<key>`; re-delivery of the same key returns the **existing** case with `idempotent: true` and creates nothing. Neither present → `400 idempotency_key_required`. Idempotency is enforced at the database (unique case-number index), not just an application pre-check.

### A.3 Responses

| Status | Body | Meaning |
|--------|------|---------|
| **201** | `{ success: true, case_id, idempotent: false }` | New case created |
| **200** | `{ success: true, case_id, idempotent: true }` | Duplicate delivery; existing case returned — terminal success, do not retry |
| **400** | `{ error: "workspace_id required" \| "idempotency_key_required" \| "invalid_json" }` | Fix the request; do not retry |
| **401** | `{ error: "invalid_signature", code }` | `code` is one of §7's signature codes |
| **429** | rate-limit response | Back off and retry |
| **500** | `{ error: "webhook_secret_not_configured" \| "webhook processing failed" }` | Server-side; safe to retry (idempotent) |

---

## Channel B — `POST /api/intake/voice` (phone channel, shared envelope)

Direct phone-channel intake on the canonical envelope. Future channels (fax / portal / api / batch) reuse this skeleton.

### B.1 Envelope + body

| Field | Type | Required | Notes |
|---|---|---|---|
| `contract_version` | `"1.1"` (or `"1.0"` during rollout) | **yes** | Anything else → `schema_invalid` |
| `submission_id` | string, 8–128 chars, `[A-Za-z0-9._:-]` | **yes** | Sender-generated, unique per logical submission, **retry-stable**. Opaque — never derived from PHI |
| `intake_channel` | `"phone"` | **yes** | Reserved for future adoption: `"efax"`, `"portal"`, `"api"`, `"batch_upload"` |
| `event` | string | no | e.g. `"intake.completed"` |
| `occurred_at` | ISO-8601 datetime with offset | no | When the call ended on the sender side |
| `from_number` | string, `^\+?[0-9]{7,15}$` | **yes** | Caller's number |
| `chat_id` / `workspace_id` / `workflow_id` / `title` | mixed | no | GR references |
| `transcript` | string \| array of `{ role?, content }` | see note | Full call transcript |
| `field_values` | object (B.2) | see note | GR's structured extraction |

**At least one of `transcript` / `field_values` is required.** Send both when available — the engine always runs its own text extraction (confidence scores, manual-review flags) and lets `field_values` win field-by-field.

### B.2 `field_values` — canonical keys (all optional)

`patient_name` · `patient_dob` (`MM/DD/YYYY` or ISO) · `member_id` · `provider_name` · `provider_npi` · `facility_name` · `payer_name` · `procedure_codes` (string[]) · `diagnosis_codes` (string[]) · `clinical_summary` · `priority` (`standard|urgent|expedited`). Unknown keys anywhere are ignored, never fatal.

### B.3 Idempotency — `submission_id` ledger

The engine claims `submission_id` in a dedicated ledger (`intake_submissions`, primary-keyed) **before** creating anything — two requests with the same id can never both create a case; the second loses at the database. A duplicate returns **`409`** with the original outcome (`error.code: "duplicate"`, `duplicate_kind: "submission_id"`, original `case_id`). Treat 409 as **terminal success**. Independent content dedup (patient + codes + caller, 24 h window, any channel) also 409s with `duplicate_kind: "content_fingerprint"`.

### B.4 Responses

**`202 Accepted`:**

```json
{
  "contract_version": "1.1",
  "received_at": "2026-07-09T14:00:01.512Z",
  "submission_id": "gr-2026-07-09-chat12345-a1b2c3",
  "authorization_number": "AUTH-2026-000042",
  "case_id": "0b6c9a4e-…",
  "case_number": "VUM-2026-104233",
  "status": "case_created",
  "extraction_source": "field_values"
}
```

Content-deficient but schema-valid payloads (no patient name or no procedure code) **pend cleanly**: `202` with `status: "pended_for_review"`, `case_id: null`, `needs_manual_review: true` + reasons — recorded in the intake log, audit trail, and ledger; never silently dropped, never a partial case, never `brief_ready` on bad data. Resubmit corrected content under a **new** `submission_id`.

### B.5 Sandbox verification (MVP environment)

Environment-scoped: the MVP env sets `INTAKE_SANDBOX_ENABLED=true`; send header `X-GR-Sandbox: true`. Real pipeline end-to-end (case → engine → cockpit queue → audit), artifacts tagged with `SBX-` case numbers. Production rejects the header with `403 sandbox_disabled`.

---

## 7. Error codes + retry rules (both channels)

| HTTP | code | Retry? |
|---|---|---|
| 400 | `schema_invalid` (B: field-level `errors: [{path,message}]`, values never echoed) · A: `workspace_id required`, `idempotency_key_required`, `invalid_json` | **No** — fix the payload |
| 401 | `signature_missing` / `signature_invalid` / `timestamp_missing` | **No** — fix the signer |
| 401 | `replay_rejected` | Re-sign with a fresh timestamp |
| 403 | `sandbox_disabled` | **No** |
| 409 | `duplicate` (B) | **No — terminal success**, original `case_id` attached |
| 429 | rate limited | After `Retry-After` |
| 500 | `internal_error` / processing failure | **Yes** — backoff, same idempotency key / `submission_id` |
| 503 | `not_configured` | Yes, with backoff + alert a human |

**One line: retry only 5xx (and 429 after `Retry-After`) with exponential backoff, always reusing the same idempotency key / `submission_id`; never retry a 4xx.**

## 8. Acceptance test

`scripts/gr-intake-verify.ts` is the single acceptance test both sides run — it exercises **both channels**: v1.1 signature accepted, v1-legacy accepted (window), tamper + replay rejected, Channel A idempotent re-delivery, Channel B ledger 409, case creation, engine processing, audit events.

```bash
# Print canonical signatures (v1.1 + legacy) for a sample payload:
GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts

# Full contract check against a running deployment (both channels):
GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts --url https://<host>
```

**Green on both sides = integration done.**

## 9. PHI rules (binding on both sides)

Never in URLs · never in logs (engine hashes patient names; validation errors carry paths, not values; sender must redact `transcript` / `field_values` / member fields from its request logs) · never in `submission_id` or `Idempotency-Key` · TLS only · don't persist payloads unencrypted after a terminal response.

## 10. Versioning

One live major version at a time. Additive optional fields may ship within v1.1; anything changing required fields, signing, or response semantics bumps the version with a parallel rollout window — exactly like the v1 → v1.1 signature window above.

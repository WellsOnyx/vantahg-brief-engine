# Canonical Intake Contract — v1.0

**Status: CANONICAL.** The engine (this repo) defines this contract; senders — Gravity Rail first — conform to it. Nothing in here is assumed or negotiable per-integration: if a sender needs something this document doesn't define, the contract gets versioned, not bent.

| | |
|---|---|
| Contract version | `1.0` (carried in every payload as `contract_version`) |
| Executable twin | `lib/intake/gr-contract.ts` (schema, signing, error codes — the route and tests import it, so code cannot drift from this doc without a test failing) |
| Acceptance test | `scripts/gr-intake-verify.ts` (§10) |
| Sender quickstart | `docs/GRAVITY_RAIL_INTEGRATION.md` |
| Owner | Core engine team. Changes require a version bump and sign-off. |

---

## 1. Endpoint

```
POST /api/intake/voice
Content-Type: application/json
```

- **Voice/phone channel** (`intake_channel: "phone"`). This is the only channel served by this endpoint in v1.
- The payload is the entire submission. **Nothing case-related ever goes in the URL or query string** — no patient identifiers, no member IDs, no submission ids. The path is static.
- HTTPS only. HTTP is redirected at the load balancer and must not be attempted.

## 2. Required headers

| Header | Value | Purpose |
|---|---|---|
| `Content-Type` | `application/json` | Body is a single JSON document, UTF-8 |
| `X-GR-Timestamp` | Unix time in **seconds**, as a decimal string | Bound into the signature; replay window (§5.3) |
| `X-GR-Signature` | `sha256=<64 lowercase hex chars>` | HMAC-SHA256 over `{timestamp}.{rawBody}` (§5) |
| `X-GR-Sandbox` | `true` *(optional)* | Sandbox submission — only honored where enabled (§9) |

## 3. The shared envelope

Every intake channel reuses this skeleton. Channel-specific body fields sit beside it at the top level.

| Field | Type | Required | Notes |
|---|---|---|---|
| `contract_version` | string, literal `"1.0"` | **yes** | Any other value → `schema_invalid` |
| `submission_id` | string, 8–128 chars, `[A-Za-z0-9._:-]` | **yes** | Sender-generated, unique per logical submission, **retry-stable** (§6). Opaque — never derived from PHI |
| `intake_channel` | string enum | **yes** | `"phone"` for this endpoint. Reserved for future channel adoption: `"efax"`, `"portal"`, `"api"`, `"batch_upload"` |
| `event` | string | no | e.g. `"intake.completed"`. Informational |
| `occurred_at` | ISO-8601 datetime with offset | no | When the underlying interaction (the call) ended on the sender side |

## 4. Phone channel body (`intake_channel: "phone"`)

### 4.1 Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `from_number` | string, `^\+?[0-9]{7,15}$` (E.164) | **yes** | Caller's number. Used for receipt routing + content dedup |
| `chat_id` | number \| string | no | Gravity Rail chat reference |
| `workspace_id` | string | no | GR workspace UUID |
| `workflow_id` | number \| string | no | GR workflow reference |
| `title` | string | no | Human label for the interaction |
| `transcript` | string \| array of `{ role?: string, content: string }` | see below | Full call transcript. Array form is joined `role: content` per line |
| `field_values` | object (§4.3) | see below | GR's structured extraction |

**At least one of `transcript` or `field_values` is required.** Send both when available: the engine always runs its own text extraction over the transcript (it produces confidence scores and manual-review flags), and lets `field_values` win field-by-field where present.

### 4.2 Example — full payload

```json
{
  "contract_version": "1.0",
  "submission_id": "gr-2026-07-06-chat12345-a1b2c3",
  "intake_channel": "phone",
  "event": "intake.completed",
  "occurred_at": "2026-07-06T13:58:22-04:00",
  "from_number": "+14155550100",
  "chat_id": 12345,
  "workspace_id": "3f6a2c1e-8f4b-4b8e-9d2a-1c5e7a9b0d3f",
  "workflow_id": 7,
  "title": "Prior auth request — knee arthroplasty",
  "transcript": [
    { "role": "assistant", "content": "What is the patient's name and date of birth?" },
    { "role": "user", "content": "John Smith, March 14th 1975, member ID ABC123456." },
    { "role": "user", "content": "We're requesting CPT 27447, total knee replacement, Dr. Alan Grant." }
  ],
  "field_values": {
    "patient_name": "John Smith",
    "patient_dob": "03/14/1975",
    "member_id": "ABC123456",
    "provider_name": "Dr. Alan Grant",
    "provider_npi": "1234567893",
    "procedure_codes": ["27447"],
    "diagnosis_codes": ["M17.11"],
    "payer_name": "Western Employers Trust",
    "priority": "standard"
  }
}
```

### 4.3 `field_values` — canonical keys

All optional. **These names are canonical** — aliases from the pre-contract era (`cpt`, `dob`, `insurance`, `caller`, …) are not part of v1 and must not be sent.

| Key | Type |
|---|---|
| `patient_name` | string |
| `patient_dob` | string (`MM/DD/YYYY` or ISO date) |
| `member_id` | string |
| `provider_name` | string |
| `provider_npi` | string (10-digit NPI) |
| `facility_name` | string |
| `payer_name` | string |
| `procedure_codes` | string[] (CPT/HCPCS) — a single delimited string is tolerated but discouraged |
| `diagnosis_codes` | string[] (ICD-10) |
| `clinical_summary` | string — free-text clinical justification |
| `priority` | `"standard"` \| `"urgent"` \| `"expedited"` |

Unknown keys inside `field_values` are ignored (never fatal). Unknown keys elsewhere in the envelope are also ignored in v1.

## 5. Authentication — HMAC-SHA256 with replay protection

### 5.1 Signing recipe

1. Serialize the payload to a JSON string. **The exact bytes you send are the bytes you sign** — no re-serialization, no whitespace normalization on either side.
2. Let `timestamp` = current Unix time in seconds, as a decimal string.
3. Build the signature base: `base = timestamp + "." + rawBody`.
4. Compute `hex = HMAC-SHA256(secret, base)` where `secret` is the value of `GRAVITY_RAIL_WEBHOOK_SECRET` shared out-of-band.
5. Send headers `X-GR-Timestamp: {timestamp}` and `X-GR-Signature: sha256={hex}` (lowercase hex; the `sha256=` prefix is canonical, though a bare hex value is accepted).

The timestamp is inside the signed content, so the timestamp header cannot be altered without invalidating the signature.

### 5.2 Worked example (verify byte-for-byte)

```
secret     = whsec_c4n0n1cal_example_do_not_use
timestamp  = 1751810400
body (308 bytes, exactly, no trailing newline):
{"contract_version":"1.0","submission_id":"gr-sub-000001","intake_channel":"phone","event":"intake.completed","from_number":"+14155550100","chat_id":12345,"transcript":"Patient John Smith, DOB 03/14/1975, member ID ABC123456, requesting prior auth for CPT 27447 total knee arthroplasty with Dr. Alan Grant."}

signature base = "1751810400." + body
X-GR-Timestamp: 1751810400
X-GR-Signature: sha256=a9b245c0cfb2c14711ad553ed871fda57d2723ee7586f8c3c5f30f1dcee2d2ed
```

Node.js reference implementation:

```js
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
// send:  X-GR-Signature: sha256=<sig>
```

This exact vector is pinned by a unit test (`__tests__/api/intake-voice.test.ts`) — if the engine's verification ever changes, that test breaks before this doc lies.

### 5.3 Replay window

`X-GR-Timestamp` must be within **±300 seconds** of the engine's clock. Outside the window → `401 replay_rejected`. Within the window, replaying an identical request is harmless: the `submission_id` ledger (§6) returns the original outcome.

### 5.4 Secret rotation (zero downtime)

Two secrets can be active simultaneously: `GRAVITY_RAIL_WEBHOOK_SECRET` (primary) and `GRAVITY_RAIL_WEBHOOK_SECRET_SECONDARY`. Verification accepts either. Rotation procedure:

1. Core sets the new secret in `GRAVITY_RAIL_WEBHOOK_SECRET_SECONDARY`. Both old and new now validate.
2. GR flips its signer to the new secret. No failed deliveries at any point.
3. Core moves the new secret to primary and clears the secondary slot.

### 5.5 Misconfiguration behavior

A production deployment with **no** webhook secret configured refuses all intake with `503 not_configured` — the endpoint fails closed; it never accepts unsigned traffic in production.

## 6. Idempotency — `submission_id`

- `submission_id` is **required**, sender-generated, and must be **retry-stable**: a network retry of the same logical submission carries the same id; a genuinely new submission always gets a new id.
- The engine claims the id in a dedicated ledger (`intake_submissions`, primary-keyed on `submission_id`) **before** creating anything. Two requests with the same id can never both create a case — the second loses at the database, not at application logic. **No double-created cases, ever.**
- A duplicate returns **HTTP 409** with the original outcome:

```json
{
  "error": {
    "code": "duplicate",
    "message": "This submission_id has already been received. Original outcome attached.",
    "duplicate_kind": "submission_id"
  },
  "contract_version": "1.0",
  "received_at": "2026-07-06T14:00:01.512Z",
  "submission_id": "gr-2026-07-06-chat12345-a1b2c3",
  "case_id": "0b6c9a4e-...",
  "status": "case_created"
}
```

- Treat `409 duplicate` as **terminal success** — the submission was already handled; record the returned `case_id` and do not retry.
- Rare race: if the duplicate arrives while the original is still mid-flight, `case_id` may be `null` and `status` `"processing"`. Do not retry with the same id in a tight loop; the original request's response is authoritative.
- **Secondary content dedup:** independent of `submission_id`, a submission whose normalized content (patient + DOB + member id + procedure codes + caller number) matches an existing case from *any* channel within a 24-hour window also returns `409` with `duplicate_kind: "content_fingerprint"` and the existing `case_id`.

## 7. Response contract

### 7.1 Success — `202 Accepted`

```json
{
  "contract_version": "1.0",
  "received_at": "2026-07-06T14:00:01.512Z",
  "submission_id": "gr-2026-07-06-chat12345-a1b2c3",
  "authorization_number": "AUTH-2026-000042",
  "case_id": "0b6c9a4e-5d21-4f3a-9c8b-7e2d1a0f6b5c",
  "case_number": "VUM-2026-104233",
  "status": "case_created",
  "extraction_source": "field_values",
  "sandbox": false
}
```

`status` on 202 is `"case_created"` or `"pended_for_review"` (§8; in that case `case_id` is `null` and `needs_manual_review: true` + `manual_review_reasons: string[]` are included).

### 7.2 Errors — structured codes to branch on

Every error body has the shape `{ "error": { "code", "message", ... }, "contract_version": "1.0" }`.

| HTTP | `error.code` | Meaning | Retry? |
|---|---|---|---|
| 400 | `schema_invalid` | Payload failed validation. `error.errors: [{ path, message }]` lists every failing field — paths only, values never echoed | **No.** Fix the payload; a retry of the same bytes fails identically |
| 401 | `signature_missing` | No `X-GR-Signature` header | **No.** Fix the signer |
| 401 | `signature_invalid` | HMAC mismatch against all active secrets | **No.** Check secret + signing recipe (§5.2) |
| 401 | `timestamp_missing` | No `X-GR-Timestamp` header | **No** |
| 401 | `replay_rejected` | Timestamp outside ±300 s | **No** automatic retry with the same timestamp; re-sign with a fresh timestamp is acceptable |
| 403 | `sandbox_disabled` | `X-GR-Sandbox` sent to an environment without sandbox enabled | **No** |
| 409 | `duplicate` | Already received (§6). Original `case_id` attached | **No — terminal success** |
| 429 | (rate limited) | Shared per-IP limiter; `Retry-After` header present | Yes, after `Retry-After` |
| 500 | `internal_error` | Engine-side failure. The idempotency claim is released on case-creation failure, so a retry **with the same `submission_id`** is safe and correct | **Yes** — same `submission_id`, exponential backoff |
| 503 | `not_configured` | Deployment misconfiguration (no secret) | Yes, with backoff + alert a human |

**Retry rule, one line: retry on 5xx (and 429 after `Retry-After`) with exponential backoff, always reusing the same `submission_id`; never retry a 4xx.**

## 8. Content-deficient payloads — the pend-cleanly path

A payload can be **schema-valid but content-deficient** — e.g. the transcript never captured a patient name or a procedure code. The gate for auto-creating a case is: *patient name present AND ≥1 procedure code* (from `field_values` or transcript extraction, whichever wins).

Below the gate, the engine **pends cleanly**:

- Returns `202` with `status: "pended_for_review"`, `case_id: null`, `needs_manual_review: true`, and `manual_review_reasons` explaining what was missing.
- The submission is recorded in the intake log (compliance trail, PHI hashed), the audit trail (`voice_intake_received` with `needs_manual_review: true`), and the idempotency ledger (`status: "pended_for_review"`) — it is never silently dropped.
- **No case row is created**, so nothing can reach `brief_ready` or any downstream state with corrupt/partial data. Silent corruption is structurally impossible on this path: the case either clears the gate whole or doesn't exist.
- Resending the same `submission_id` after the pend returns `409 duplicate` with `status: "pended_for_review"` — to submit corrected content, use a **new** `submission_id`.

## 9. Sandbox verification (MVP environment)

Environment-scoped — **not** a demo-mode shortcut; the production code path is identical.

- The MVP environment sets `INTAKE_SANDBOX_ENABLED=true`. Production never sets it; a sandbox-flagged request to production returns `403 sandbox_disabled`.
- Send the header `X-GR-Sandbox: true`. Everything else — signature, schema, idempotency — is exactly the production contract, using the MVP environment's webhook secret.
- The submission flows through the **real** pipeline: webhook → case row → engine (brief + routing, where enabled) → cockpit queue → audit events.
- Sandbox artifacts are identifiable for cleanup: case numbers are prefixed `SBX-` (e.g. `SBX-VUM-2026-104233`), and `intake_submissions.sandbox = true`.

## 10. Acceptance test

`scripts/gr-intake-verify.ts` sends a signed payload end-to-end and reports pass/fail on each link: signature accepted → case created → engine processed → visible in cockpit queue → audit events fired → idempotent on resend (plus negative probes: tampered signature, stale timestamp). **The integration is done when this script is green from both sides.** Usage is documented in `docs/GRAVITY_RAIL_INTEGRATION.md`.

## 11. PHI rules (binding on both sides)

- **Never in URLs:** no patient identifiers, member IDs, DOBs, or free text in paths or query strings — the endpoint takes everything in the signed body.
- **Never in logs:** the engine hashes patient names in its intake log and keeps raw PHI out of audit rows and error responses (validation errors carry field paths, not values). The sender must hold the same line: request/response logging on the GR side must redact `transcript`, `field_values`, and any extracted patient fields.
- **Never in `submission_id`:** the charset restriction enforces opacity; do not derive ids from patient data.
- Transport is TLS-only; payloads must not be persisted unencrypted on the sender side after a `202`/`409` is received.

## 12. Versioning

- `contract_version` is a literal in the schema. A payload claiming any other version is rejected `schema_invalid` — there is exactly one live version at a time until a v2 is published side-by-side.
- Additive, backward-compatible changes (new optional fields) may ship within v1; anything that changes required fields, signing, or response semantics bumps the version and gets a parallel rollout window.

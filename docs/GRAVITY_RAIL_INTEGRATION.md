# Gravity Rail → VantaUM Intake: Integration Guide

**Audience:** the Gravity Rail team. You have never seen this repo — everything you need is on this page and in [`INTAKE_CONTRACT.md`](INTAKE_CONTRACT.md) (the full spec; this page is the quickstart).

**The one-sentence version:** when a phone-voice chat completes, POST a signed JSON payload to our intake endpoint; we return `202` with a `case_id`.

---

## Endpoint

```
POST https://<environment-host>/api/intake/voice
Content-Type: application/json
```

You will be given two hosts: the **MVP/verification environment** (integrate here first) and production. Same contract, different `GRAVITY_RAIL_WEBHOOK_SECRET` values.

## Signing every request

Secret env var (our side): `GRAVITY_RAIL_WEBHOOK_SECRET` — the value is shared with you out-of-band, one per environment. Never commit it, never log it.

For each request:

```js
const crypto = require('crypto');

const rawBody = JSON.stringify(payload);          // sign EXACTLY the bytes you send
const timestamp = String(Math.floor(Date.now() / 1000)); // unix seconds
const signature = crypto.createHmac('sha256', SECRET)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');

await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GR-Timestamp': timestamp,
    'X-GR-Signature': `sha256=${signature}`,
  },
  body: rawBody,
});
```

Timestamps more than **5 minutes** off our clock are rejected (`replay_rejected`). Byte-for-byte verification vector for your implementation: [`INTAKE_CONTRACT.md` §5.2](INTAKE_CONTRACT.md#52-worked-example-verify-byte-for-byte).

## Sample signed payload

```
X-GR-Timestamp: 1751810400
X-GR-Signature: sha256=a9b245c0cfb2c14711ad553ed871fda57d2723ee7586f8c3c5f30f1dcee2d2ed
(signed with secret whsec_c4n0n1cal_example_do_not_use — example only)
```

```json
{"contract_version":"1.0","submission_id":"gr-sub-000001","intake_channel":"phone","event":"intake.completed","from_number":"+14155550100","chat_id":12345,"transcript":"Patient John Smith, DOB 03/14/1975, member ID ABC123456, requesting prior auth for CPT 27447 total knee arthroplasty with Dr. Alan Grant."}
```

Field-by-field schema (what's required, types, the `field_values` structured-extraction block): [`INTAKE_CONTRACT.md` §3–4](INTAKE_CONTRACT.md#3-the-shared-envelope).

**Three rules that bite if missed:**

1. `submission_id` (8–128 chars of `[A-Za-z0-9._:-]`) must be **unique per call and identical across retries of that call**. It's our double-create guard.
2. `contract_version` must be the literal `"1.0"`.
3. Send `transcript`, `field_values`, or both — both is best.

## Responses

**Success = `202`:**

```json
{
  "contract_version": "1.0",
  "received_at": "2026-07-06T14:00:01.512Z",
  "submission_id": "gr-sub-000001",
  "case_id": "0b6c9a4e-...",
  "case_number": "VUM-2026-104233",
  "authorization_number": "AUTH-2026-000042",
  "status": "case_created"
}
```

If the call didn't capture enough to open a case (no patient name or no procedure code), you still get `202` with `status: "pended_for_review"` and `case_id: null` — we hold it for human follow-up; nothing is lost.

**Error table:**

| HTTP | `error.code` | What you did / what to do |
|---|---|---|
| 400 | `schema_invalid` | Payload shape wrong — `error.errors[]` lists each `{ path, message }`. Fix and send with a **new** submission_id. Do not retry as-is |
| 401 | `signature_missing` / `signature_invalid` / `timestamp_missing` | Signing bug or wrong secret. Do not retry until fixed |
| 401 | `replay_rejected` | Timestamp stale — re-sign with a fresh timestamp |
| 403 | `sandbox_disabled` | You sent `X-GR-Sandbox: true` to an environment that doesn't allow it |
| 409 | `duplicate` | **Terminal success.** We already have this submission — the original `case_id` is in the body. Record it, stop |
| 429 | — | Rate limited. Honor the `Retry-After` header |
| 5xx | `internal_error` / `not_configured` | Our problem. Retry with exponential backoff, **same submission_id** |

**Retry policy: retry only 5xx (and 429 after `Retry-After`), exponential backoff, always the same `submission_id`. Never retry a 4xx.**

## Verifying in the sandbox

The MVP environment has `INTAKE_SANDBOX_ENABLED=true`. Add the header `X-GR-Sandbox: true` and your submissions run the **real** pipeline (case created, engine runs, audit fires) but are tagged for cleanup (`SBX-` case numbers). Production rejects that header outright, so a leftover sandbox flag can't touch real data.

## Definition of done

The integration is complete when the acceptance script is green against the MVP environment:

```bash
GR_VERIFY_BASE_URL=https://<mvp-host> \
GRAVITY_RAIL_WEBHOOK_SECRET=<mvp secret> \
npx tsx scripts/gr-intake-verify.ts
```

It proves, in order: signature accepted → case created → engine processed → case visible in the cockpit queue → audit events fired → duplicate resend returns 409 with the original case_id → tampered signature and stale timestamp are rejected. Both teams run the same script; green on both sides = done.

## PHI handling (non-negotiable)

- No patient data in URLs or query strings — everything rides in the signed body.
- Redact `transcript` and `field_values` from your request logs.
- Never build `submission_id` from patient data.
- TLS only; don't persist payloads unencrypted after receiving `202`/`409`.

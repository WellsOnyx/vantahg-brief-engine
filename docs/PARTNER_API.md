# VantaUM Partner API — v1

**Audience:** the engineering team of a partner organization (a TPA / payer whose claims or EHR system will push cases into VantaUM and receive decisions back). You do not need access to this repo — this page plus your issued credentials is the whole integration.

**The loop in one sentence:** POST a case in, poll or receive a signed webhook when it's decided, acknowledge receipt — your system never waits on a human on our side to move data.

| | |
|---|---|
| API version | `v1` (path-versioned: `/api/partner/v1/…`) |
| Auth | `X-API-Key` header — issued per partner, scoped to your tenant |
| Idempotency | required `Idempotency-Key` header on writes; enforced at our database |
| Decision-out | signed webhooks (`X-VUM-Signature`) + polling endpoints |
| Acceptance test | `scripts/partner-api-verify.ts` — green = integration done |

## 1. Environments and credentials

You receive, per environment (test, production):
- An **API key** (`vum_live_…`). Send it as `X-API-Key` on every request. It is bound to your client tenant — you can only ever create and read your own cases, regardless of request contents.
- If you registered a **webhook URL**: a **webhook secret** (`vumwh_…`) used to verify our signed events (§5).

Keys are stored hashed on our side and can be rotated on request (a new key is issued and both work until you confirm cutover).

## 2. Submit a case

```
POST /api/partner/v1/cases
X-API-Key: vum_live_…
Idempotency-Key: <your-stable-reference>
Content-Type: application/json
```

**`Idempotency-Key` is required**: 8–128 chars of `[A-Za-z0-9._:-]`, unique per logical case, **identical across retries of that case**, never derived from patient data. It is claimed in a primary-keyed ledger *before* anything is created — two requests with the same key can never create two cases. It is also stored as the case's `client_reference` and echoed in every read and event, so you can correlate without persisting our IDs.

```jsonc
{
  "patient_name": "John Smith",             // REQUIRED
  "patient_dob": "1975-03-14",
  "patient_member_id": "ABC123456",
  "procedure_codes": ["27447"],             // REQUIRED, ≥1 CPT/HCPCS
  "diagnosis_codes": ["M17.11"],
  "procedure_description": "Total knee arthroplasty, right",
  "clinical_summary": "…free-text clinical justification…",
  "case_type": "um",                        // um | medical_review | payer_idr | iro | ire
  "review_type": "prior_auth",              // prior_auth | medical_necessity | concurrent |
                                            // retrospective | peer_to_peer | appeal | second_level_review
  "priority": "standard",                   // standard | urgent | expedited
  "service_category": "surgery",
  "requesting_provider": "Dr. Alan Grant",
  "requesting_provider_npi": "1234567893",
  "facility_name": "North Peak Surgical",
  "payer_name": "Western Employers Trust",
  "turnaround_deadline": "2026-07-11T17:00:00-04:00",  // your SLA clock, optional
  "document_urls": ["https://…/clinical-packet.pdf"]
}
```

**Responses**

- `202` — accepted, case created:
  ```json
  { "api_version": "v1", "idempotent": false, "case_id": "…", "case_number": "VUM-API-2026-104233",
    "client_reference": "<your Idempotency-Key>", "authorization_number": "AUTH-2026-000042",
    "status": "intake", "received_at": "…" }
  ```
- `200` + `"idempotent": true` — we already had this `Idempotency-Key`; the original case is attached. **Terminal success — do not retry.**
- `409 duplicate_content` — the same patient + procedure content arrived on another channel within 24 h (e.g. the provider also faxed it); the existing case is attached. Terminal.
- `400 schema_invalid` — field-level `errors: [{path, message}]`. Fix and send as a *new* attempt.
- `400 idempotency_key_required` · `401 unauthorized` · `403 forbidden` (scope) · `429` (honor `Retry-After`) · `5xx` (retry with backoff, **same** `Idempotency-Key`).

**Retry rule (identical to every VantaUM contract): retry only 5xx and 429, exponential backoff, always the same `Idempotency-Key`; never retry a 4xx.**

## 3. Poll for changes

```
GET /api/partner/v1/cases?since=2026-07-09T00:00:00Z&limit=100
```

Returns your tenant's cases ordered by `updated_at` desc — each with `case_id`, `client_reference`, `status`, `case_type`, `review_type`, `determination`, `determination_at`, timestamps. Poll with your last high-water `updated_at`; webhooks (§5) make polling a fallback rather than the primary loop.

## 4. Read one case

```
GET /api/partner/v1/cases/{id}
```

`{id}` may be our `case_id` **or your own `Idempotency-Key`** (`client_reference`). Returns workflow status plus, once decided:

```json
"determination": { "decision": "approve", "rationale_summary": "…", "decided_at": "…" }
```

Cases outside your tenant return the same `404` as nonexistent ones — the API never confirms what it protects. No clinical narrative or brief internals are exposed; the decision and its rationale summary are the partner surface.

## 5. Decision-out webhooks

When a determination is recorded (including IDR attorney determinations), we POST to your registered webhook URL:

```jsonc
{
  "event": "case.determination",
  "api_version": "v1",
  "case_id": "…",
  "case_number": "VUM-API-2026-104233",
  "client_reference": "<your Idempotency-Key>",
  "status": "determination_made",
  "determination": { "decision": "approve", "decided_at": "…" },
  "occurred_at": "…"
}
```

**Verify every delivery** — same recipe you may already know from our intake contract:

```
X-VUM-Timestamp: <unix seconds>
X-VUM-Signature: sha256=hex( HMAC_SHA256( webhook_secret, timestamp + "." + rawBody ) )
```

Reject if the timestamp is more than 300 s from your clock or the HMAC doesn't match. Respond `2xx` fast (enqueue, don't process inline). **Delivery guarantees:** at-least-once; retries at 1/5/15/60/240 minutes, then dead-letter (our operators are alerted). De-duplicate on (`case_id`, `event`, `occurred_at`).

## 6. Acknowledge receipt

```
POST /api/cases/{case_id}/acknowledge
X-API-Key: vum_live_…
{ "acknowledged_by": "optum-claims-bridge", "notes": "ingested into EHR" }
```

Closes the loop on our side (case → `delivered`, audit-logged). Requires your API key; only works on your own tenant's cases.

## 7. PHI rules (binding on both sides)

Nothing patient-identifying in URLs or query strings (the read-by-reference path uses your opaque key — keep it opaque) · never derive `Idempotency-Key` from patient data · TLS only · verify webhook signatures before trusting payloads · our error responses echo field *paths*, never values.

## 8. Acceptance

```bash
X_API_KEY=vum_live_… npx tsx scripts/partner-api-verify.ts --url https://<host>
```

Exercises: submit → 202, idempotent resend → 200 `idempotent:true`, schema-invalid → field errors, read by `client_reference`, cross-tenant probe → 404, unauthenticated → 401. **Green on both sides = integration done.**

# Canonical Intake Contract — Gravity Rail → VantaUM

**Status: CANONICAL.** This is the stable contract the GR integration signs and posts against. Verify your implementation with `npx tsx scripts/gr-intake-verify.ts` (see bottom).

## Endpoint

```
POST https://app.vantaum.com/api/gr/webhook
Content-Type: application/json
```

Called when a Gravity Rail intake chat (web / sms / voice) reaches handoff. We turn it into a VantaUM case via the shared intake chassis.

## Authentication — HMAC-SHA256 (required in production)

Every request MUST carry a signature of the **raw request body**:

```
X-Webhook-Signature: <hex( HMAC_SHA256( rawBody, GR_WEBHOOK_SECRET ) )>
```

- Algorithm: HMAC-SHA256, output as lowercase hex.
- Signed input: the **exact bytes** of the JSON body you send (sign the serialized string, then send that same string).
- Key: the shared secret `GR_WEBHOOK_SECRET` (provisioned by VantaUM; never commit it).
- We compare in constant time. A missing/invalid signature returns **401** and nothing is persisted.
- If the server has no secret configured in real mode, it fails closed (**500 `webhook_secret_not_configured`**) rather than accept unsigned intake.

## Idempotency — exactly-once

GR delivery is at-least-once (retries happen). We de-duplicate so a case is created **once**:

- Send an **`Idempotency-Key`** header, or include a stable **`chat_id`** in the body (the header wins if both are present).
- The case is keyed `GR-<idempotencyKey>`. A re-delivery of the same key returns the **existing** case with `idempotent: true` and does not create a duplicate.
- A request with neither an `Idempotency-Key` nor a `chat_id` returns **400 `idempotency_key_required`**.

## Request body

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

## Responses

| Status | Body | Meaning |
|--------|------|---------|
| **201** | `{ success: true, case_id, idempotent: false }` | New case created |
| **200** | `{ success: true, case_id, idempotent: true }` | Duplicate delivery; existing case returned |
| **400** | `{ error: "workspace_id required" \| "idempotency_key_required" \| "invalid_json" }` | Fix the request; do not retry |
| **401** | `{ error: "invalid_signature" }` | Signature missing/invalid |
| **429** | rate-limit response | Too many requests (120/min); back off and retry |
| **500** | `{ error: "webhook_secret_not_configured" \| "webhook processing failed" }` | Server-side; safe to retry (idempotent) |

## Retry semantics

- Retry on **429** and **5xx** with exponential backoff. Safe: the same key is idempotent.
- Do **not** retry **4xx** (401/400) — fix signing or payload first.

## Signing examples

**Node:**
```js
import crypto from 'node:crypto';
const body = JSON.stringify(payload);
const sig = crypto.createHmac('sha256', process.env.GR_WEBHOOK_SECRET).update(body).digest('hex');
await fetch('https://app.vantaum.com/api/gr/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sig, 'Idempotency-Key': String(payload.chat_id) },
  body,
});
```

**Shell:**
```bash
BODY='{"event":"chat.handoff","chat_id":84213,"workspace_id":"ws_abc123"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GR_WEBHOOK_SECRET" | sed 's/^.* //')
curl -sS -X POST https://app.vantaum.com/api/gr/webhook \
  -H "Content-Type: application/json" -H "X-Webhook-Signature: $SIG" -H "Idempotency-Key: 84213" \
  --data "$BODY"
```

## Verify your integration

```bash
# Print a signature for a sample payload (matches our server exactly):
GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts

# Run the full contract check against a running endpoint:
GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts --url https://app.vantaum.com/api/gr/webhook
```

The `--url` run asserts: valid signature → 2xx, tampered signature → 401, replay → idempotent 200, missing idempotency key → 400.

## Stability

This contract (endpoint, signature scheme, headers, idempotency, status codes) is stable. Changes are versioned and communicated to the GR team before rollout.

## Server-side follow-ups (VantaUM infra)

- Recommend a `UNIQUE` index on `cases.case_number` so idempotency is enforced at the DB layer, not just the pre-check (closes the last of the create race). Tracked as an infra migration.
- `GR_WEBHOOK_SECRET` must be set in the real/MVP environment (see the secrets checklist).

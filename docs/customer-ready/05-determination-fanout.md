# 05 — After determination: where it goes

On MD sign (R13), write **once** to SoR, then fan out asynchronously. Fan-out failures retry with backoff; case stays `fanout_pending` until success or manual resolve.

## Write-once package (immutable)

Store under `determinations/{case_id}/{version}/`:

- Final brief PDF/HTML
- Determination letter (if contracted)
- Evidence manifest + content hashes
- Signer id, signed_at, IP/session audit refs
- Criteria output snapshot
- CM flags

No silent overwrite; amendments = new version + link.

## Fan-out targets (v1)

| # | Target | When | Payload |
|---|--------|------|---------|
| F1 | Client portal | Always | Status + download links |
| F2 | Client webhook | If configured | Signed JSON event (see below) |
| F3 | Fax / provider portal push | If contracted | Letter/PDF |
| F4 | Secure email notice | If contracted | Link or encrypted — never PHI in subject |
| F5 | Billing ledger | Always | Billable event (07) |
| F6 | Care management handoff | If `cm_handoff_enabled` and flags non-empty | 09 payload |
| F7 | Archive | Always | Same as write-once package |

## Webhook event (minimum)

```json
{
  "event": "determination.signed",
  "case_id": "...",
  "external_id": "...",
  "type": "prior_auth",
  "determination": "approve",
  "determined_at": "...",
  "sla_status": "ok",
  "download_url": "https://...(expiring)",
  "cm_flags": ["high_cost"],
  "signature": "hmac..."
}
```

## Failure handling

- Retry 8x exponential; then `fanout_failed` + CX task.
- Never mark `closed` until F1 + F5 succeed; F2–F4–F6 best-effort with visibility.

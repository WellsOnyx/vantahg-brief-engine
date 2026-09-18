# 09 — Care management connect

## Philosophy

We **signal** CM; we do not replace their CM platform on day one.

## CM-relevant flags (v1 set)

Configurable per client; defaults:

- `high_cost`
- `deny_with_alternative`
- `readmission_risk` (only if criteria pack supports)
- `behavioral_health`
- `needs_discharge_planning`
- `appeals_in_flight`

Set on determination from criteria output + MD checkbox overrides.

## Handoff channels (in order of preference)

1. **Webhook** to client CM endpoint (HMAC) — same reliability pattern as determination webhook
2. **Secure CSV drop** (SFTP) daily for flagged cases
3. **Portal “CM queue”** tab for clients without an endpoint

## Payload (webhook)

```json
{
  "event": "cm.handoff",
  "case_id": "...",
  "external_id": "...",
  "flags": ["high_cost"],
  "determination": "deny",
  "determined_at": "...",
  "secure_summary_url": "https://...(expiring)"
}
```

## Explicitly later

- Bidirectional EHR writeback
- Embedded CM workflows inside VantaUM
- Sharing full clinical notes into non-BAA tools

## Acceptance

- Flagged case appears in CM channel < 5 minutes after sign (webhook) or next daily drop (CSV)
- Unflagged cases never appear in CM feed

# Go-live log (template)

Copy to `clients/{client_id}/go-live-log.md`. **No PHI** — case ids and tokenized refs only.

| At | Actor | Kind | Note |
|----|-------|------|------|
| | Cole / Jonah | secrets | Phase 0.4 encryption + secrets checklist signed (ENABLE_AWS_* still default false) |
| | Ops | pack | E1 synthetic pack (≥10) PASS / FAIL |
| | Ops | shadow | E2 shadow pack (≥10) PASS — member/provider final sends = 0 |
| | CX | live | E3 first-25 started. N agreed with client: 25 |
| | Ops | rollback | (only if miss rate > threshold) Pause live intake, stay on shadow |

Threshold: `client_config.sla_miss_rollback_threshold` or `SLA_MISS_ROLLBACK_THRESHOLD` (default 0.2).

Code also appends the same events to the in-process go-live log (`GET /api/golive`, `/admin/onboarding`).

# 03 — Incoming authorization workflow (if-this-then-that)

All branches are **data**, not tribal knowledge. Implement as a versioned rules table evaluated in order. Every evaluation writes an `audit_event`.

## Case types (v1)

1. `prior_auth`
2. `first_level_appeal`

## Shared state machine

```text
received
→ intake_validated | intake_incomplete
→ routed
→ briefing | awaiting_clinicals
→ md_queue
→ determined (approve | deny | pend | partial)
→ fanout_pending → fanout_complete
→ closed
(+ appeal_attached may reopen path into briefing)
```

Terminal: `closed`, `cancelled_by_client`, `withdrawn`.

## Rule table (v1 — ship these)

| ID | When | Then | SLA clock |
|----|------|------|-----------|
| R01 | Payload missing required fields (member id ref, DOS/procedure or Rx, requesting provider, clinicals pointer) | `intake_incomplete`; create `request_clinicals` task; notify CX + client portal | **Pause** |
| R02 | Clinicals received after R01 | Resume clock; → `routed` | Resume |
| R03 | Benefit type = pharmacy/drug (config) | Route `lane=pharmacy` | Running |
| R04 | Benefit type = medical | Route `lane=medical` | Running |
| R05 | Duplicate of open case (same client keys) | Link duplicate; do not double-bill; notify CX | N/A |
| R06 | Urgent flag per client config | Set `sla_hours_urgent`; priority boost in MD queue | Urgent SLA |
| R07 | Criteria engine: clear meet | Draft **approve** brief → `md_queue` (MD confirm required at go-live) | Running |
| R08 | Criteria engine: clear fail | Draft **deny** brief + alt if any → `md_queue` | Running |
| R09 | Criteria engine: gray / insufficient evidence | Draft **pend** or gray brief → `md_queue`; optional clinical request | Running |
| R10 | No MD action within 50% SLA | Escalation L1: CX ping reviewer | Running |
| R11 | No MD action within 80% SLA | Escalation L2: CX + client contact (status only) | Running |
| R12 | SLA breach | Escalation L3: CX owner + ops; mark `sla_missed` | Breached |
| R13 | MD signs | → `determined`; enqueue fan-out; create billable event | Stop |
| R14 | Inbound is first-level appeal | Attach prior auth case id; new case `first_level_appeal`; load prior package + new evidence → briefing | New clock |
| R15 | Client cancels / withdraws | → cancelled/withdrawn; no billable if before brief start (fee schedule may vary) | Stop |
| R16 | CM-relevant outcome flags (see 09) | Attach flags on determination; enqueue CM handoff | N/A |

## Required fields (intake_validated)

Minimum viable (tune per client config):

- Client case / external id
- Member reference (tokenized / internal id — minimize unnecessary PHI in logs)
- Requesting provider
- Service / Rx identity
- Place of service / urgency
- Clinicals attachment or link in SoR storage
- Received_at

## Criteria engine interface

- Input: normalized clinical packet + client criteria pack id
- Output: `meet | fail | gray` + citations + draft determination rationale
- **Does not** finalize. MD signs.

## Audit event schema (minimum)

```text
event_id, case_id, at, actor (system|user_id), rule_id?,
from_state, to_state, note (non-PHI preferred), payload_hash
```

## Out of scope for v1 rules

- Auto-approve without MD
- Multi-payer complex coordination of benefits
- Full NCQA accreditation automation (track manually)

# 04 — Case object & three role views

**One case object. Three lenses.** Do not build three apps.

## Canonical case object (fields)

```text
case_id
client_id
external_id
type                  # prior_auth | first_level_appeal
state
lane                  # medical | pharmacy
priority
sla_due_at
sla_status            # ok | at_risk | missed
received_at
determined_at?
determination         # approve | deny | pend | partial | null
signer_id?
brief_id
packet_storage_keys[]
parent_case_id?       # appeals
billable_event_id?
fanout_status
cm_flags[]
audit_cursor
```

## View: Client portal

**Purpose:** status, downloads, invoices summary, light reports.

Must show:

- Open cases + SLA clocks
- Determinations + downloadable package (letter/PDF as contracted)
- Appeals linked to prior auth
- Invoice / statement summary (link to 07)
- Config summary (read-only SLAs, contacts)

Must **not** expose: internal CX notes, other clients, raw model prompts, break-glass logs.

## View: CX

**Purpose:** keep accounts healthy without touching clinical judgment.

Must show:

- Account health (open, at-risk SLA, breached, stuck awaiting clinicals)
- Commitments / next actions (call client, chase missing clinicals)
- Non-PHI relationship memory (gifts, scheduling) — separate store
- Escalation queue from R10–R12
- Hypercare checklist for first 25 live

Must **not** show: full clinical packet by default (break-glass with reason if ever needed — prefer “status only”).

## View: Med review / ops

**Purpose:** work the queue and sign.

Must show:

- Queue sorted by SLA then priority
- Brief + packet + criteria output
- Sign determination UI (approve/deny/pend/partial + rationale edit)
- Handoff / fan-out status after sign
- Peer / QA sample flag (optional v1.1)

MFA required. Session timeout aggressive.

## Shared UX rules

- Role filter on the same APIs (`/api/cases` with RBAC).
- Every mutation → audit_event.
- PHI fields only on BAA surfaces; redact in CX where possible.

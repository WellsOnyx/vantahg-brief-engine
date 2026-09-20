# Client onboarding runbook (Cole)

This is the **A→E** path from [`docs/customer-ready/02-onboarding.md`](../customer-ready/02-onboarding.md). Use it plus `/admin/onboarding` — no tribal knowledge required.

**Synthetic only.** No live PHI. Empty vendor slots stay empty. `ENABLE_AWS_*` stay **false** until an operator exports them at deploy. Completing this runbook is a **code / ops gate**, not a HIPAA attestation.

UI: [`/admin/onboarding`](../../app/admin/onboarding/page.tsx)  
Catalog: [`lib/onboarding/checklist.ts`](../../lib/onboarding/checklist.ts)

---

## Day 0 — kickoff

Confirm LOBs, SLAs, primary intake mode, determination channels, CX owner, reviewer queue. Write it down; then publish `client_config` v1.

## Day 1–2 — config + users + connectivity (staging)

### Phase A — Commercial & legal (before any PHI)

| ID | Gate | Artifact |
|----|------|----------|
| A1 | Required | Signed MSA + fee schedule → `clients/{id}/msa.pdf` |
| A2 | **Hard** | Executed BAA → `clients/{id}/baa.pdf`. Live PHI is illegal without this. |
| A3 | Hard | Subprocessor BAAs (Anthropic if clinical, fax, e-sign, hosting) |
| A4 | Client-dependent | Security / SOC pack |
| A5 | Required | Invoice entity + billing contact (Meow, not Stripe) |

Fee schedule: paid door is VantaHG Med Review. UM Brief Engine is included only when `client_config.vanta_med_review_contract` is true. Do not sell standalone UM. Do not invent prices.

Pointers: [`06-hipaa-baa-path.md`](../customer-ready/06-hipaa-baa-path.md), [`07-billing-and-tracking.md`](../customer-ready/07-billing-and-tracking.md).

### Phase B — `client_config` (SoR)

Publish via `POST /api/client-config` (append-only; PATCH/DELETE → 409). Required fields:

`client_id`, `legal_name`, `lob[]`, `sla_hours_standard`, `sla_hours_urgent`, `auto_vs_md_policy` (**`always_md` at go-live**), `notify_channels[]`, `determination_recipients`, `cm_handoff_enabled`, `intake_modes[]`, `timezone`, `business_hours`, `escalation_contacts[]`, `cx_owner`, `reviewer_queue`, `go_live_mode`, `shadow_mode`, `sla_miss_rollback_threshold`, `vanta_med_review_contract` (**required true for free UM Brief Engine**), `med_review_provider` (`vanta` | `third_party` | `none`).

Every SLA or route change = new version + CX written confirm with the client.

### Phase C — Access

- Invite client admin (Cognito only if `ENABLE_AWS_AUTH=true`; default hybrid stays off)
- MFA for clinical roles
- Least-privilege: client / CX / med review / superadmin
- Test login on staging (`/client`, `/cx`, `/med-review`)

### Phase D — Connectivity (staging until Phase E)

Pick **one** primary. Empty HMAC slots = synthetic allow. Do not invent production keys.

| Mode | Acceptance |
|------|------------|
| Gravity Rail | `POST /api/intake/gravity-rail` synthetic → case-spine < 2 min |
| External API | `POST /api/external/submit` |
| Fax (Phaxio) | `{ synthetic: true }` → case |
| SFTP | Document in `clients/{id}/connectivity.md` (connector not live yet) |

## Day 3–4 — E1 synthetic pack

```bash
npm run test:go-live-synthetic
# or POST /api/golive/synthetic from /admin/onboarding
```

≥10 cases: happy path + missing clinicals (R01 → `intake_incomplete`, SLA paused) + gray zone (`md_queue`, no auto-approve). Client can watch `/client` and `/med-review`.

## Day 5–7 — E2 shadow

```bash
# POST /api/golive/shadow
```

≥10 live-shaped synthetic packets. MD signs. Fan-out may record **intent only**. **No final outbound to member or requesting provider** (`shadow_mode` / `go_live_mode=shadow`).

## Day 8+ — E3 live hypercare (first 25)

Full fan-out. MD on every determination. Daily CX standup until first 25 clear. Scorecard: `/cx` (already shipped in Phase 5) + go-live log here.

### Rollback (E4)

If SLA miss rate on the first 25 **> `sla_miss_rollback_threshold`** (default **0.2**, or `SLA_MISS_ROLLBACK_THRESHOLD`):

1. Pause live intake.
2. Stay on shadow.
3. Root-cause. A rollback note is written to the go-live log.

This is a **code gate**. It does not mean HIPAA is complete.

## Artifacts folder (per client)

```text
clients/{client_id}/
  msa.pdf / baa.pdf
  config/vN.json
  connectivity.md
  go-live-log.md
  hypercare-notes.md   # non-PHI
```

Template: [`go-live-log.md`](go-live-log.md).

## Still human ops (not this PR)

SES verify + sandbox exit · Fargate image rebuild · BAA before live PHI · production vendor keys · flip `ENABLE_AWS_AUTH` only after a staging tenant is ready.

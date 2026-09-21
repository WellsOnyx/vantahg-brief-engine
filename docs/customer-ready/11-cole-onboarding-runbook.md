# 11 — Cole A→E onboarding runbook (Phase 7.1)

**Owner:** Cole (ops) · **UI:** [`/admin/onboarding`](../../app/admin/onboarding/page.tsx) · **Catalog:** [`lib/onboarding/checklist.ts`](../../lib/onboarding/checklist.ts)

This is the operator path so Cole can run commercial/legal → `client_config` → access → connectivity → go-live **without tribal knowledge**. Framework lock: [`02-onboarding.md`](02-onboarding.md). Commit acceptance: [`10-implementation-commits.md`](10-implementation-commits.md) § 7.1.

Checking boxes is a **code / ops gate**, not a HIPAA attestation.

---

## Hard constraints (do not skip)

1. **Synthetic fixtures only.** Tokenized refs (`memb_synth_*`). No live PHI in this runbook, the UI, fixtures, or packs.
2. **Do not flip `ENABLE_AWS_AUTH`** or any `ENABLE_AWS_*` default. Do not invent production vendor keys. Empty HMAC slots = synthetic allow.
3. **Packaging lock (corrected 2026-09-21):** **VantaUM sells Med Review** as the paid wedge. Brief Engine / UM is included free **only** when the buyer uses Vanta med review under **UM’s contract**. No standalone free UM SKU. No free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Optum frozen (no outreach). Canonical: [`01-product-boundary.md`](01-product-boundary.md).
4. **BAA is a hard gate** before live PHI ([`06-hipaa-baa-path.md`](06-hipaa-baa-path.md)). This runbook does not claim HIPAA complete.
5. **Every live determination is human MD-signed.** No silent auto-approve. Billing path is **Meow**, not Stripe.

---

## Where to click

| Surface | URL / command | Why |
|---------|---------------|-----|
| Checklist UI | `/admin/onboarding` | Check A→E items, run E1/E2/E4, publish synthetic config |
| API | `GET` / `PATCH /api/admin/onboarding` | Progress (CX/admin only; clients 403) |
| Config | `POST /api/client-config` | Append-only versions. PATCH/DELETE → 409 |
| Fixture | [`fixtures/client-config-synthetic.json`](fixtures/client-config-synthetic.json) | Staging tenant `11111111-1111-1111-1111-111111111111` |
| Client / CX / Med | `/client` · `/cx` · `/med-review` | Three lenses on one case object |
| Setup | `/admin/setup` | Env/connection probes (separate from this runbook) |
| Go-live log template | [`docs/onboarding/go-live-log.md`](../onboarding/go-live-log.md) | Copy to `clients/{id}/go-live-log.md` |

Local demo: `npm run dev` — no secrets. AWS-shaped local is optional and **not** required to finish A→E on synthetic.

---

## Day script

### Day 0 — kickoff

Confirm LOBs, SLAs, **one** primary intake mode, determination channels, CX owner, reviewer queue. Confirm the buyer uses **Vanta med review under UM’s contract** (VantaUM sells Med Review). VantaHG is IRO + IDR only. Write it down; publish `client_config` v1.

### Day 1–2 — config + users + connectivity (staging)

Work phases A → D below. Staging only. Empty vendor slots stay empty.

### Day 3–4 — E1 synthetic

```bash
npm run test:go-live-synthetic
# or click “Run synthetic pack” on /admin/onboarding
```

≥10 cases: happy path + missing clinicals (R01 → `intake_incomplete`, SLA paused) + gray zone (`md_queue`). Client watches `/client` and `/med-review`.

### Day 5–7 — E2 shadow

```bash
curl -s -X POST http://localhost:3000/api/golive/shadow \
  -H 'content-type: application/json' \
  -d '{}'
```

≥10 live-shaped **synthetic** packets. MD signs. Fan-out records **intent only**. `member_provider_final_sends` must be `0`.

### Day 8+ — E3 live hypercare (first 25)

Full fan-out. MD on every determination. Daily CX standup until first 25 clear. Scorecard: `/cx`.

**Rollback (E4):** if first-25 SLA miss rate > `sla_miss_rollback_threshold` (default **0.2**), pause live intake, stay on shadow, root-cause. Click “Evaluate first-25 SLA” or `POST /api/golive`.

Human ops still required before **real** live PHI (not this slice): SES verify, Fargate image rebuild, executed BAA, production vendor keys, RDS-native bootstrap.

---

## Phase A — Commercial & legal (before any PHI)

| ID | Gate | What Cole does |
|----|------|----------------|
| A1 | Required | MSA + fee schedule signed → `clients/{id}/msa.pdf`. Fee minimums: per prior auth, per first-level appeal, optional rush, monthly minimum. Meow, not Stripe. |
| A2 | **Hard** | Executed BAA → `clients/{id}/baa.pdf`. Live PHI is illegal without this. |
| A3 | Hard | Subprocessor BAAs (Anthropic if clinical, fax, e-sign, hosting). Do not invent keys. |
| A4 | Client-dependent | Security / SOC pack if the client requires it. |
| A5 | Required | Invoice entity + billing contact in Meow/QB. Do not enable `ENABLE_REAL_MEOW` from this runbook. |

Check items off on `/admin/onboarding` (or `PATCH /api/admin/onboarding` with `{ "item_id": "A2", "done": true }`).

---

## Phase B — `client_config` (SoR)

Publish via `POST /api/client-config` (append-only). Required fields match `02-onboarding.md` Phase B plus go-live knobs:

`client_id`, `legal_name`, `lob[]`, `sla_hours_standard`, `sla_hours_urgent`, `auto_vs_md_policy` (**`always_md` at go-live**), `notify_channels[]`, `determination_recipients`, `cm_handoff_enabled`, `intake_modes[]`, `timezone`, `business_hours`, `escalation_contacts[]`, `cx_owner`, `reviewer_queue`, `go_live_mode`, `shadow_mode`, `sla_miss_rollback_threshold`.

### Publish the synthetic fixture

```bash
curl -s -X POST http://localhost:3000/api/client-config \
  -H 'content-type: application/json' \
  -d @docs/customer-ready/fixtures/client-config-synthetic.json
```

Or click **Publish synthetic client_config** on `/admin/onboarding`.

```bash
curl -s "http://localhost:3000/api/client-config?client_id=11111111-1111-1111-1111-111111111111"
curl -s "http://localhost:3000/api/client-config?client_id=11111111-1111-1111-1111-111111111111&history=1"
```

Every SLA or route change = **new version** + CX written confirm. `PATCH` / `DELETE` → 409.

Start at `go_live_mode=synthetic`. Move to `shadow` for E2. `live` only for E3.

---

## Phase C — Access

| ID | What Cole does |
|----|----------------|
| C1 | Invite client admin via `POST /api/team/invite`. **Do not flip `ENABLE_AWS_AUTH`.** Cognito stays off until a staging tenant is ready. |
| C2 | Record MFA-for-clinical policy. Enforce in Cognito only after an operator exports the flag at deploy. |
| C3 | Least-privilege: client / CX / med_review / superadmin. Tenant B 404s on tenant A. Client 403 on CX notes. |
| C4 | Test login: `/login` → `/client` (admin) and `/med-review` (MD). Demo mode needs no secrets. |
| C5 | Open `/cx`. Notes are non-PHI. Never paste clinical text. |
| C6 | Open `/med-review`. Sign is the only determination path. Brief required before `md_queue`. |
| C7 | Break-glass is time-boxed + audited. `GET /api/case-spine/{id}/audit` on a synthetic case. |

Invite example (synthetic email only):

```bash
curl -s -X POST http://localhost:3000/api/team/invite \
  -H 'content-type: application/json' \
  -d '{"email":"client-admin-synth@example.com","role":"client"}'
```

---

## Phase D — Connectivity (staging until Phase E)

Pick **one** primary. Document it in `clients/{id}/connectivity.md`. Add secondary only after E1–E2 are stable.

| Mode | Acceptance command |
|------|--------------------|
| Gravity Rail | `POST /api/intake/gravity-rail` with `{ "synthetic": true, ... }` → case-spine ≪ 2 min |
| External API | `POST /api/external/submit` (HMAC required only when `EXTERNAL_API_SECRET` is set) |
| Fax (Phaxio) | `{ "synthetic": true }` → spine case. Live OCR stays on cron / `ENABLE_REAL_EFAX`. |
| SFTP | **Not wired.** Document folder + PGP only; do not claim a live file-drop path. |

Empty HMAC slots stay empty. Do not invent production keys.

Gravity Rail synthetic (copy-paste):

```bash
curl -s -X POST http://localhost:3000/api/intake/gravity-rail \
  -H 'content-type: application/json' \
  -d '{"synthetic":true,"member_ref":"memb_synth_001","requesting_provider":"prov_synth_001","service_or_rx":"CPT-73721","place_of_service":"office","urgency":"standard","clinicals_pointer":"s3://synth/packet/001.pdf","external_id":"gr-cole-1","benefit_type":"medical"}'
```

---

## Phase E — Go-live gates

| Gate | Count | Rule |
|------|-------|------|
| E1 Synthetic | ≥ 10 | Happy path + missing clinicals + gray zone |
| E2 Shadow | ≥ 10 | MD signs; **no** outbound to member/provider as final |
| E3 Live | First N (default 25) | Full fan-out; MD on every determination; daily CX standup |
| E4 Rollback | — | Miss rate > threshold → pause live, stay on shadow |
| E5 Secrets | Cole + Jonah | Phase 0.4 checkbox in go-live log. Flags stay false. |

---

## Artifacts folder (per client)

```text
clients/{client_id}/
  msa.pdf / baa.pdf
  config/vN.json
  connectivity.md
  go-live-log.md
  hypercare-notes.md   # non-PHI
```

No PHI in filenames, notes, or the go-live log.

---

## Still human ops (not Phase 7.1)

SES domain verify + sandbox exit · Fargate image rebuild · BAA before live PHI · production vendor keys · flip `ENABLE_AWS_AUTH` only after a staging tenant is ready · RDS-native bootstrap.

## Acceptance (7.1)

- Cole can run A→E from `/admin/onboarding` + this file without asking Jonah for hidden steps.
- Every checklist item has owner, artifact, gate, pointer, and **how_to**.
- Synthetic fixture publishes through `POST /api/client-config`.
- No live PHI. No `ENABLE_AWS_*` flips. Med Review packaging lock respected.

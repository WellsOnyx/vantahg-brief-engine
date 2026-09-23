# VantaUM Customer-Ready Plan

**Status:** Working plan (Jonah → Cole, 2026-09-18)  
**Repo home:** `docs/customer-ready/`  
**Product:** Vanta Utilization Management — concierge clinical layer (intake → Brief Engine → MD determination → auth / first-level appeal → IRO-ready docs)  
**Site:** https://vantaum.com · Contact: hello@wellsonyx.com  
**North-star loop:** intake → rules → brief → MD sign → outbound decision → billable event → report

This folder is the shared brain for shipping customer-ready VantaUM. Files are numbered to match **commit / implementation order**. Do not skip ahead of an open gate.

## Definition of done (first live customer)

A TPA or self-insured employer can:

1. Complete onboarding (contract, BAA, config, users, connectivity).
2. Send synthetic → shadow → live prior-auth / first-level appeal cases.
3. See the case in the right role view (Client / CX / Med review).
4. Receive a signed determination via agreed channel(s).
5. See a billable ledger line and a monthly statement.
6. Export core reports (volume, TAT, outcomes, SLA, cost/case).
7. Hand CM-relevant outcomes to care management without a deep EHR embed.

**Hard constraints**

- Live PHI only on AWS Brief Engine + BAA-covered services (RDS, S3, SES, Cognito). No live PHI in Grok chats, agent boxes, or CX memory.
- Every live determination is human MD-signed at go-live (no silent auto-approve).
- **VantaUM sells Med Review** as the paid wedge. Brief Engine / UM is included free **only** when the buyer uses Vanta med review under **UM’s contract**. No standalone free UM SKU. No free UM with a third-party review shop. **VantaHG = IRO + IDR only** — not the med-review commercial door. UM still owns Brief Engine SoR/tech. See `01-product-boundary.md`.
- Optum / Kari Cook: frozen until Jonah explicitly opens with context.
- Same buyer across UM/IRO doors: flag Health before any external draft.

## Document map (commit order)

| # | File | What it locks |
|---|------|----------------|
| 00 | This README | North star, DoD, constraints |
| 01 | Product boundary & ownership | SKUs, lanes, what we are / are not |
| 02 | Onboarding framework | Checklist, config schema, go-live gates |
| 03 | Auth workflow rules | If-this-then-that for incoming authorizations |
| 04 | Case object & role views | Client / CX / Med review dashboards |
| 05 | Determination fan-out | Where signed decisions go |
| 06 | HIPAA & BAA path | Compliance gates before live PHI |
| 07 | Billing & tracking | Events → ledger → invoice. Two-line prices: [um-unit-economics-rate-card.md](um-unit-economics-rate-card.md). Rules: [um-pricing-rules.md](um-pricing-rules.md) |
| 08 | Reporting | MVP reports + exports |
| 09 | Care management connect | Flags, webhook, CSV — not Epic day one |
| 10 | Implementation commits | Exact build sequence + owners + acceptance |

## Related in-flight

- AWS cutover draft PR: https://github.com/WellsOnyx/vantahg-brief-engine/pull/50  
  Branch: `cursor/aws-adapter-cutover-aa74`  
  Merge + Cognito auth cutover are Phase 0 of implementation (see `10-implementation-commits.md`).

## How to use this

1. Cole reviews and comments in the PR that lands these docs.
2. Implementation follows `10-implementation-commits.md` in order; each phase is a PR (or stacked commits) with the listed acceptance tests.
3. STATUS updates go in `STATE.md` when a phase flips from open → done.

---

# 01 — Product boundary & ownership

## What is included (under a Vanta med-review contract)

These are **capabilities**, not standalone paid UM SKUs. **VantaUM sells Med Review** as the paid wedge. Brief Engine / UM is included free **only** when the buyer uses Vanta med review under **UM’s contract**.

| Capability | Included | Not included (yet) |
|-------|----------|--------------------|
| **Prior authorization** | Intake, clinical brief, MD determination, notices as contracted, portal status | Full care management platform |
| **First-level appeal** | Packet + prior auth attach, appeal brief, MD determination, IRO-ready export | External IRO decisioning (VantaHG — IRO + IDR only) |
| **CX layer** | Account relationship, stuck-case chase, scheduling/gifts/memory **non-PHI** | Clinical judgment |

## What sits underneath (SoR)

- **AWS Brief Engine** = clinical system of record (BAA).
- **Gravity Rail** = customer-facing intake front door (HTTP; vendor-agnostic of DB).
- **Grok CX bots** = relationship only; never live PHI.

## Lane ownership (do not blur)

| Lane | Owner | Notes |
|------|-------|--------|
| UM Brief Engine SoR + tech + UM ops/CX + Med Review commercial | **VantaUM** | **Paid wedge.** VantaUM sells Med Review. Brief Engine / UM included free only under UM’s med-review contract. |
| IDR Ops + IRO | **VantaHG** | **IRO + IDR only.** Not the med-review commercial door. |
| Total Rewards / CHRO | **VantaTR** | Out of scope for this plan |
| Cross-bot coordination | **Onyx Health** | Health group chat |

## LOCKED 2026-09-21 — Med Review wedge (Jonah, hard correction)

Do not soften. Packaging / GTM + product-boundary only. Customer-ready Phases 0–7 code path remains complete; this is **not** a new build phase. Entitlement behavior is unchanged (`vanta_med_review_contract` + `med_review_provider=vanta`).

- **VantaUM sells Med Review** as the paid wedge.
- **Brief Engine / UM is included free ONLY when the buyer uses Vanta med review under UM’s contract.**
- **No standalone free UM SKU.**
- **No free UM with a third-party review shop.**
- **VantaHG = IRO + IDR only** — not the med-review commercial door.
- **Optum frozen** (no outreach) until Jonah explicitly opens with context.
- UM still owns Brief Engine SoR and tech. Do not move SoR ownership off UM.
- Compute COGS planning band **~$0.05–$0.15 per review** vs **~$1 internal budget** (estimate; not measured COGS).

### Entitlement (code)

Free UM Brief Engine access requires published `client_config.vanta_med_review_contract=true` and `med_review_provider=vanta`. `med_review_provider=third_party` never grants free UM. Guard: `lib/entitlements/um-brief-engine.ts`.

## Explicit non-goals for first customer

- Multi-bot CX swarm (prove 1 bot × ~10 accounts first).
- Deep EHR / Epic bidirectional.
- Full ERP / claims adjudication.
- Replacing the client’s existing CM platform.
- Auto-approve without MD on live cases.

## Success metric for “ready”

One paying client live on the north-star loop with BAA path proven, three role views usable, ledger + 5 reports, CM handoff via webhook/CSV.

---

# 02 — Client onboarding framework

Onboarding is a **sellable checklist** first, software second. Every step produces an artifact in SoR or Drive (contracts) with an owner and a date.

## Phase A — Commercial & legal (before any PHI)

| Step | Owner | Artifact | Gate |
|------|-------|----------|------|
| A1 MSA + fee schedule | Jonah / commercial | Signed MSA | Required |
| A2 BAA (covered entity ↔ Vanta) | Legal | Executed BAA | **Hard gate** for live PHI |
| A3 Subprocessor BAAs | Ops | Anthropic (if clinical), fax, e-sign, hosting as applicable | Hard gate |
| A4 Security questionnaire / SOC if required | Cole / ops | Completed pack | Client-dependent |
| A5 Invoice entity + billing contact | Finance | Stripe/QB customer id | Required |

### Fee schedule (minimum fields)

**VantaUM sells Med Review** (paid wedge). Do not invent a second price list here. Two-line card: [um-unit-economics-rate-card.md](um-unit-economics-rate-card.md) (platform + clinical review; rules/auto review is $0). Do not sell UM as a standalone SKU. Do not include free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Do not call the platform fee $0 under Med Review (open question on the rate card).

- Vanta med-review contract under **UM** (paid wedge)
- UM Brief Engine included free **only** when `vanta_med_review_contract` is true and `med_review_provider=vanta`
- Per-auth / first-level-appeal / rush lines are **usage tracking** under that contract, not a standalone UM offer
- Pass-through (IRO filing fees if ever bundled — N/A until locked; HG lane)

## Phase B — Client configuration (SoR)

Store as `client_config` (versioned). Required fields:

```text
client_id
legal_name
lob[]                    # lines of business covered
sla_hours_standard
sla_hours_urgent
auto_vs_md_policy        # go-live: always_md
notify_channels[]        # portal | webhook | fax | email(secure)
determination_recipients # roles / endpoints
cm_handoff_enabled
cm_webhook_url?          # if enabled
intake_modes[]            # gravity_rail | api | sftp | fax
timezone
business_hours
escalation_contacts[]    # name, role, phone/email (business contact; minimize PHI)
cx_owner                 # internal MX Delivery Lead / CX bot id
reviewer_queue           # med review team
vanta_med_review_contract # required true for free UM Brief Engine
med_review_provider      # vanta | third_party | none  (third_party never gets free UM)
```

**Config change control:** every change creates a new version + audit event; CX confirms with client in writing for SLA or route changes.

## Phase C — Access

| Role | Sees | Auth |
|------|------|------|
| Client admin | Users, config summary, invoices, reports | Cognito (post-cutover) |
| Client user | Their cases, downloads, limited reports | Cognito |
| CX | Account health, stuck cases, commitments (non-PHI notes) | Internal |
| Med review / MD | Queue, briefs, packets, sign | Internal + MFA |
| Superadmin | All | Break-glass + audit |

Checklist:

- [ ] Client admin invited
- [ ] MFA enforced for clinical roles
- [ ] Least-privilege roles assigned
- [ ] Test login on staging

## Phase D — Connectivity

Pick **one** primary intake for go-live; add secondary after stable.

| Mode | Setup | Acceptance |
|------|-------|------------|
| Gravity Rail | Keys + HMAC + callback URLs | Synthetic case appears in queue < 2 min |
| External API | `POST /api/external/submit` key + optional HMAC | Same |
| Fax (eFax/Phaxio) | Number + webhook HMAC | Synthetic fax → case |
| SFTP | Folder + PGP if required | File drop → case |

Staging only until Phase E.

## Phase E — Go-live gates

| Gate | Count | Rule |
|------|-------|------|
| E1 Synthetic | ≥ 10 | Happy path + 2 failure paths (missing clinicals, gray zone) |
| E2 Shadow | ≥ 10 | Live-shaped packets; MD signs; **no** outbound to member/provider as final |
| E3 Live | First N (agree N with client, default 25) | Full fan-out; MD on every determination; daily standup with CX |

**Rollback:** if SLA miss rate > agreed threshold in first 25, pause live intake, stay on shadow, root-cause.

## Onboarding runbook (CX script)

Day 0: kickoff — confirm LOBs, SLAs, intake mode, determination channels.  
Day 1–2: config + users + connectivity in staging.  
Day 3–4: synthetic pack run with client watching portal.  
Day 5–7: shadow.  
Day 8+: live with hypercare (CX daily until first 25 clear).

## Artifacts folder (per client)

```text
clients/{client_id}/
  msa.pdf / baa.pdf
  config/vN.json
  connectivity.md
  go-live-log.md
  hypercare-notes.md   # non-PHI
```

---

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

---

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

---

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

---

# 06 — HIPAA & BAA path

## Honest split

| Surface | PHI allowed? | Why |
|---------|--------------|-----|
| AWS Brief Engine (RDS, S3, SES, Cognito, Fargate) | **Yes**, under BAA | Clinical SoR |
| Grok / VantaUM agent computers / chat | **No** | Not a BAA environment |
| CX relationship memory | **No** live PHI | Status + account only |
| Demo / synthetic packs | Synthetic only | Pre-BAA and training |

## Hard gates before first live PHI case

1. Executed client BAA + required subprocessor BAAs.
2. Merge AWS DB/email path (PR #50) and deploy with `ENABLE_AWS_DB/STORAGE/EMAIL=true`.
3. Cognito auth cutover for clinical users (`ENABLE_AWS_AUTH=true`); kill Supabase Auth hybrid for live tenants.
4. SES domain verified; exit sandbox (or dedicated production identity).
5. Encryption at rest/in transit verified; secrets in SSM/Secrets Manager — not in git.
6. Access logging + admin audit review path documented.
7. Retention + disposal policy written; backup/restore tested once.
8. Breach notification runbook (contacts, 60-hour internal clock discipline).
9. Minimum necessary / role access reviewed with Cole + legal.
10. No PHI in tickets, Slack, Health chat, or email subjects.

## Operational rules

- Synthetic → shadow → live (see 02 Phase E).
- MD sign every live determination at go-live.
- Break-glass access: reason code + time-boxed + weekly review.
- Vendors (Meow, HelloSign, Phaxio, Gravity Rail): production keys only after BAA/DPA as applicable; slots without keys stay dark.

## Explicit non-compliance traps

- Pasting clinical text into Grok for “help drafting.”
- Forwarding denial letters through personal email.
- Using local zip / laptop demo mode with real PHI.

---

# 07 — Track and bill

## Principle

**Case events create money events.** Do not bill from memory or spreadsheets as system of record.

**Prices:** working decision memo is [pricing-strategy-memo-2026-09-23.md](pricing-strategy-memo-2026-09-23.md). Two-line card is [um-unit-economics-rate-card.md](um-unit-economics-rate-card.md) (supersedes the review-only card). Platform default $1.50 PMPM (engine, criteria, intake rails, gold-card file, reporting). Rules/auto review posts at $0. Nurse, MD, and external bill once at the highest touch. VantaUM sells Med Review. VantaHG = IRO + IDR only. Do not invent a second card here. Do not treat the platform line as $0 under Med Review. Do not publish internal margins.

## Billable event

Created on R13 (MD signed), unless fee schedule says otherwise (e.g. cancel rules).

```text
billable_event_id
case_id
client_id
sku               # prior_auth | first_level_appeal | rush_addon
quantity          # 1
unit_price
currency
occurred_at
invoice_id?       # null until invoiced
status            # open | invoiced | void
```

## Tracking (ops)

Dashboard metrics from events (not guesses):

- received_count, briefed_count, signed_count, delivered_count
- TAT percentiles
- SLA hit rate
- void / cancel rate

## Invoicing (MVP)

1. Monthly job groups `open` billable events per client.
2. Generate statement (PDF + portal page).
3. Export to Stripe and/or QuickBooks.
4. Mark events `invoiced`.

**Out of scope v1:** complex proration, multi-currency, claims 837 — use export + human finance.

## Voids / disputes

- Void requires reason + approver; audit_event; never delete row.

---

# 08 — Robust reporting (MVP that clients actually use)

## Client-facing reports (week one)

| Report | Grain | Columns (core) |
|--------|-------|----------------|
| Volume | Day / week | received, signed, open |
| Turnaround | Case | received_at → determined_at hours; p50/p90 |
| Outcomes | Case | approve / deny / pend / partial rates |
| Deny reasons | Case | normalized reason codes |
| SLA | Case | hit / miss / at_risk |

## Delivery

- Portal page (filter by date, LOB, type)
- CSV export (same columns)
- Optional scheduled email of **CSV link** (secure) — not PHI in body

## Internal / CX reports

- Account health rollup
- Hypercare first-25 scorecard
- Fan-out failure rate
- Escalation counts (R10–R12)

## v1.1 (after ledger clean)

- Cost per case (internal)
- Trend vs prior period
- CM flag frequency
- Appeal overturn vs uphold

## Non-goals

- Full BI warehouse day one
- Pixel-perfect board decks from the app (export to Sheets if needed)

---

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

---

# 10 — Implementation commits (ship order)

Work in this order. Each phase = PR (or stacked commits on one branch) with acceptance checks. Owners: **Cole** (build/infra), **Jonah** (commercial/gates), **VantaUM** (product/spec), **Legal** (BAA), **HG** (consult only if IRO touch).

## Phase 0 — AWS SoR foundations (blocker)

**Depends on:** PR #50 merge + Cognito cutover.

| Commit / PR slice | Deliverable | Acceptance |
|-------------------|-------------|------------|
| 0.1 | Merge AWS RDS/SES/S3 path | `/api/health` shows `backends.db=rds` in staging |
| 0.2 | Cognito auth for clinical + client roles | Login without Supabase Auth for staging tenant |
| 0.3 | SES production identity | Can send determination email in staging without sandbox bounce |
| 0.4 | Secrets + encryption checklist signed | Cole + Jonah checkbox in go-live log |

## Phase 1 — Case spine + audit

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 1.1 | Canonical `cases` schema + state machine | Create/retrieve case; illegal transitions rejected |
| 1.2 | `audit_events` writer on every transition | Sample case shows full trail |
| 1.3 | Rules engine R01–R16 as data | Toggle R01 in config; incomplete intake pauses SLA |

## Phase 2 — Intake connectivity

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 2.1 | Gravity Rail path hardened | Synthetic → case < 2 min |
| 2.2 | External submit API + HMAC | Same |
| 2.3 | One fax path (Phaxio or eFax) | Synthetic fax → case |
| 2.4 | Client config CRUD + versioning | Config vN immutable history |

## Phase 3 — Brief → MD sign

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 3.1 | Brief Engine hooked to case states | Brief attached before md_queue |
| 3.2 | Med review queue UI | Sort by SLA; open packet + brief |
| 3.3 | Sign determination | Immutable package written; state=determined |

## Phase 4 — Fan-out + billing events

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 4.1 | Portal status + downloads | Client sees determination |
| 4.2 | Webhook fan-out + retries | Failed webhook → fanout_failed + CX task |
| 4.3 | Billable event on sign | Ledger row exists |
| 4.4 | Monthly statement stub | PDF/portal for one test client |

## Phase 5 — Three views

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 5.1 | Client portal MVP | Open/SLA/decisions/invoices summary |
| 5.2 | CX view MVP | Stuck + escalations + hypercare list |
| 5.3 | RBAC pass | Roles cannot see cross-tenant or wrong PHI surfaces |

## Phase 6 — Reporting + CM

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 6.1 | Five client reports + CSV | Matches ledger counts |
| 6.2 | CM flags + webhook/CSV | Flagged only; < 5 min webhook |
| 6.3 | Internal ops scoreboard | Fan-out fail rate + stuck-case count visible |

## Phase 7 — Onboarding + go-live

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 7.1 | Onboarding checklist UI or runbook in repo + Drive | Cole can run A→E without tribal knowledge |
| 7.2 | Synthetic pack (10) | Pass |
| 7.3 | Shadow (10) | Pass |
| 7.4 | Live hypercare (25) | SLA threshold held or rollback |

## Parallel (do not block Phase 0–3)

- Lint cleanup on main
- CX bot 1×10 accounts (non-PHI) — after client portal status API exists
- Med Review wedge **corrected 2026-09-21** — **VantaUM sells Med Review**; Brief Engine / UM free only under UM’s Vanta med-review contract; **VantaHG = IRO + IDR only**. Packaging/GTM only; see `01-product-boundary.md`. Entitlement gate unchanged. Not a new build phase.

## PR discipline

- One phase per PR preferred; reference this file section in PR body.
- Update `STATE.md` when a phase completes.
- No live PHI in PR fixtures — synthetic only.

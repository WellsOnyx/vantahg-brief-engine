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
| 7.1 | Onboarding checklist UI or runbook in repo + Drive | Cole can run A→E without tribal knowledge. Operator path: `docs/customer-ready/11-cole-onboarding-runbook.md` + `/admin/onboarding` (how_to on every item). |
| 7.2 | Synthetic pack (10) | Pass |
| 7.3 | Shadow (10) | Pass |
| 7.4 | Live hypercare (25) | SLA threshold held or rollback |

## Phase 8 — Muse CX connector (stub, not live)

CX / relationship surface only. Clinical SoR stays on AWS. No PHI in Muse. No live muse.ai HTTP. Spec: `12-muse-connector.md`. Cole’s production order: `13-go-live-ops.md`.

| Slice | Deliverable | Acceptance |
|-------|-------------|------------|
| 8.1 | `lib/muse` + `/api/muse/webhook` + `/api/muse/status` | Production with no webhook secret fails closed. No API key → 503 `not_configured`. HMAC when a secret is set. `live_call` stays false |
| 8.2 | PHI allowlist + CX panel | `screenMusePayload` rejects PHI fields and does not store them. `/cx` “Muse touchpoints” lists rows only when `MUSE_CX_ENABLED=true` and `MUSE_API_KEY` is set; empty state otherwise |
| 8.3 | Go-live ops punch list | `13-go-live-ops.md` — Cole runs env slots → RDS migrations including `027` → `scripts/bootstrap-real-client.ts` → synthetic/shadow/hypercare (runbook A–E) → BAA pointers. No live PHI until `06-hipaa-baa-path.md` is confirmed |

Packaging lock is unchanged: VantaUM sells Med Review; Brief Engine free only under the Vanta med-review contract; VantaHG = IRO + IDR only; Optum frozen. Gravity Rail intake stays fail-closed and idempotent.

## Parallel / non-blocking (do not block Phase 0–7)

- Lint cleanup on main
- CX bot 1×10 accounts (non-PHI) — after client portal status API exists
- Med Review wedge **corrected 2026-09-21** — **VantaUM sells Med Review**; Brief Engine / UM free only under UM’s Vanta med-review contract; **VantaHG = IRO + IDR only**. Packaging/GTM only; see `01-product-boundary.md`. Entitlement gate unchanged. Not a new build phase.
- UM prices **superseded 2026-09-23** — two-line card (`um-unit-economics-rate-card.md`, `um-pricing-rules.md`). Platform PMPM + one clinical tier. Rules/auto review posts at $0. Config in `lib/billing/um-price-card.ts`. Migration `032`.
- Muse Connector Platform (muse.ai) — **Phase 8 stub is in repo** (`12-muse-connector.md`). Still not live-keyed. No PHI. Production use gated by HIPAA review. Go-live order is `13-go-live-ops.md`, not this connector.

## PR discipline

- One phase per PR preferred; reference this file section in PR body.
- Update `STATE.md` when a phase completes.
- No live PHI in PR fixtures — synthetic only.

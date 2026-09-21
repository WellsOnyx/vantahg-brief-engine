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

## Parallel / non-blocking (do not block Phase 0–7)

- Lint cleanup on main
- CX bot 1×10 accounts (non-PHI) — after client portal status API exists
- Med Review wedge **locked 2026-09-20** — packaging/GTM only; see `01-product-boundary.md`. Not a new build phase.
- Muse Connector Platform (muse.ai) — queued CX/relationship surface; no live PHI; research/submit unblocked; production gated by HIPAA review. See `docs/PROGRESS.md` § Roadmap / next connectors.

## PR discipline

- One phase per PR preferred; reference this file section in PR body.
- Update `STATE.md` when a phase completes.
- No live PHI in PR fixtures — synthetic only.

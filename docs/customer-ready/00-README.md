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
| 07 | Billing & tracking | Events → ledger → invoice |
| 08 | Reporting | MVP reports + exports |
| 09 | Care management connect | Flags, webhook, CSV — not Epic day one |
| 10 | Implementation commits | Exact build sequence + owners + acceptance |
| 11 | Cole A→E runbook | Operator steps so Cole can run onboarding without tribal knowledge |
| 12 | Muse connector (Phase 8 stub) | CX-only relationship surface. No PHI. Not live-keyed |
| 13 | Go-live ops punch list | Ordered env, RDS `027`, bootstrap, A–E, BAA. No live PHI until the BAA path is confirmed |
| — | [lint-hydrate-allowlist.md](lint-hydrate-allowlist.md) | Five intentional `set-state-in-effect` hydrate sites; lint is otherwise fail-closed |

## Related in-flight

- Phase 0.1 AWS path: [PR #50](https://github.com/WellsOnyx/vantahg-brief-engine/pull/50) — **merged**.
- Phase 0.2 Cognito cutover: [PR #53](https://github.com/WellsOnyx/vantahg-brief-engine/pull/53) — **merged**. Default `ENABLE_AWS_AUTH=false`.
- Phase 1 case spine + audit + R01–R16: [PR #52](https://github.com/WellsOnyx/vantahg-brief-engine/pull/52) — **merged**.
- Phases 0–7 customer-ready code path: on `main`. Remaining human ops (SES, Fargate, BAA, keys) are the ordered script in [`13-go-live-ops.md`](13-go-live-ops.md). Not a HIPAA attestation.
- Phase 8 Muse connector: [`12-muse-connector.md`](12-muse-connector.md) — CX relationship stub only. No live PHI. No live Muse HTTP.

## How to use this

1. Cole reviews and comments in the PR that lands these docs.
2. Implementation follows `10-implementation-commits.md` in order; each phase is a PR (or stacked commits) with the listed acceptance tests.
3. STATUS updates go in `STATE.md` when a phase flips from open → done.

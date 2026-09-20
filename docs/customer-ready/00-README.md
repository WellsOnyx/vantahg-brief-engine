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
- Paid door = Med Review (VantaHG). VantaUM Brief Engine / UM is included free only when the buyer uses Vanta med review — not a standalone free UM SKU, not free with another shop’s med review. UM still owns Brief Engine SoR/tech. See `01-product-boundary.md`.
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

## Related in-flight

- Phase 0.1 AWS path: [PR #50](https://github.com/WellsOnyx/vantahg-brief-engine/pull/50) — **merged**.
- Phase 0.2 Cognito cutover: [PR #53](https://github.com/WellsOnyx/vantahg-brief-engine/pull/53) — **merged**. Default `ENABLE_AWS_AUTH=false`.
- Phase 1 case spine + audit + R01–R16: [PR #52](https://github.com/WellsOnyx/vantahg-brief-engine/pull/52) — **merged**.
- Phases 0–7 customer-ready code path: on `main` through Phase 6; Phase 7 is this onboarding / go-live PR. Remaining = human ops (SES, Fargate, BAA, keys). Not a HIPAA attestation.

## How to use this

1. Cole reviews and comments in the PR that lands these docs.
2. Implementation follows `10-implementation-commits.md` in order; each phase is a PR (or stacked commits) with the listed acceptance tests.
3. STATUS updates go in `STATE.md` when a phase flips from open → done.

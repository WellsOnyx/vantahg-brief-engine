# 01 — Product boundary & ownership

**Updated 2026-10-19.** The 2026-09-21 packaging correction still holds on the commercial offer: no standalone UM, no free engine with another shop. The platform sentence from that date is superseded. Detail: [`17-med-review-pivot.md`](17-med-review-pivot.md).

## What is sold

**Vanta Med Review** is the only product these surfaces sell. The Brief Engine — intake, clinical brief, authorization, and first-level appeal — is the shared engine under IDR, IRO, and Medical Review. It is included only under a paid Med Review contract. It is not a fourth product line.

| Capability | Included under a paid Med Review contract | Not included |
|------------|--------------------------------------------|--------------|
| **Prior authorization** | Intake, clinical brief, MD determination, notices as contracted, portal status | Full care management platform |
| **First-level appeal** | Packet + prior auth attach, appeal brief, MD determination, IRO-ready export | IRO decisioning (separate line) |
| **CX layer** | Account relationship, stuck-case chase, scheduling/gifts/memory **non-PHI** | Clinical judgment |

## What sits underneath (shared engine)

- **Brief Engine** = clinical system of record for the three lines (BAA before any live PHI). Code stays in this repo. It is infrastructure, not a SKU.
- **Gravity Rail** = customer-facing intake front door (HTTP; vendor-agnostic of DB).
- **Grok CX bots** = relationship only; never live PHI.

## Lines (do not blur)

| Line | What it is | Commercial door |
|------|------------|-----------------|
| Medical Review | Paid wedge. This repo’s customer surfaces sell this. | `vanta_med_review_contract=true` and `med_review_provider=vanta` |
| IRO | Separate line. Not opened by a Med Review contract. | Not this slice. Parallel IRO portal. |
| IDR | Separate line. Not opened by a Med Review contract. | Not this slice. |
| Brief Engine | Shared engine under the three lines. Not sold alone. | Included only with the Med Review contract above |
| Total Rewards / CHRO | **VantaTR** | Out of scope |
| Cross-bot coordination | **Onyx Health** | Out of scope |

The 2026-09-21 platform sentence that limited VantaHG to IRO and IDR is **superseded**. Vanta HG runs three firewalled lines: IDR, IRO, and Medical Review. A Med Review contract does not open IRO or IDR.

Line-firewall enforcement (a line dimension on every case, server-side denial across lines, intake that routes a request out of the wrong line) is **not in this change**. It lands in the parallel IRO portal slice. Decision (b) — one system with locked-off lines versus separate systems — stays open. This boundary is written so either topology can adopt it.

## LOCKED commercial offer

Do not soften the offer. Entitlement behavior is unchanged.

- **Vanta Med Review** is the paid product.
- **The Brief Engine is included only under a paid Vanta Med Review contract.**
- **No standalone UM SKU.** No free engine with a third-party review shop.
- **A Med Review contract does not entitle IRO or IDR.**
- **Optum frozen** (no outreach) until Jonah explicitly opens with context.
- Engine code stays in this repo. Do not fork a second engine for the pivot.
- Compute COGS planning band **~$0.05–$0.15 per review** vs **~$1 internal budget** (estimate; not measured COGS).
- Med Review price card (two-line, working decision 2026-09-23): [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md). Memo: [`pricing-strategy-memo-2026-09-23.md`](pricing-strategy-memo-2026-09-23.md). Rules/auto **review** is $0. Gold-card review is $0. Nurse, MD, and external peer are billed once at the highest touch. **Platform is a separate membership** (default $1.50 PMPM). Open question, unresolved: does the Med Review wedge waive the $1.50 platform, or only the $0 auto review? Platform remains not $0 under Med Review unless a fat-TPA waiver. Do not publish internal margins. Do not copy this card into an IRO fee schedule. No IRO fee amount is hard-coded.

### Entitlement (code)

Brief Engine access requires published `client_config.vanta_med_review_contract=true` and `med_review_provider=vanta`. `med_review_provider=third_party` never grants the engine. Guard: [`lib/entitlements/um-brief-engine.ts`](../../lib/entitlements/um-brief-engine.ts). Field names and denial codes are stable: `missing_vanta_med_review_contract`, `standalone_um_not_offered`, `third_party_med_review`. Default for a newly published config is **false** / `none`. The synthetic staging tenant is seeded `true` / `vanta` so demo packs stay on the Vanta shop.

## Explicit non-goals for first customer

- Multi-bot CX swarm (prove 1 bot × ~10 accounts first).
- Deep EHR / Epic bidirectional. EMR link is open decision (a); standalone intake stays the path until that is decided.
- Full ERP / claims adjudication.
- Replacing the client’s existing CM platform.
- Auto-approve without MD on live cases.
- IRO portal lifecycle, IRO fee schedule, and line-firewall code (parallel slice).
- Merging draft PR #83 as-is. Re-scope it before merge. See [`17-med-review-pivot.md`](17-med-review-pivot.md).

## Success metric for “ready”

One paying Med Review client live on the north-star loop with BAA path proven, three role views usable, ledger + 5 reports, CM handoff via webhook/CSV.

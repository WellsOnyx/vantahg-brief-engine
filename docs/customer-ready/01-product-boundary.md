# 01 — Product boundary & ownership

## What is included (under a Vanta med-review contract)

These are **capabilities**, not standalone paid UM SKUs. The commercial door is VantaHG Med Review. Brief Engine / UM is included only when the buyer uses Vanta med review under that contract.

| Capability | Included | Not included (yet) |
|-------|----------|--------------------|
| **Prior authorization** | Intake, clinical brief, MD determination, notices as contracted, portal status | Full care management platform |
| **First-level appeal** | Packet + prior auth attach, appeal brief, MD determination, IRO-ready export | External IRO decisioning (HG lane) |
| **CX layer** | Account relationship, stuck-case chase, scheduling/gifts/memory **non-PHI** | Clinical judgment |

## What sits underneath (SoR)

- **AWS Brief Engine** = clinical system of record (BAA).
- **Gravity Rail** = customer-facing intake front door (HTTP; vendor-agnostic of DB).
- **Grok CX bots** = relationship only; never live PHI.

## Lane ownership (do not blur)

| Lane | Owner | Notes |
|------|-------|--------|
| UM Brief Engine SoR + tech + UM ops/CX | **VantaUM** | Auth, appeals, client/CX views. Product and engineering stay UM. |
| IDR Ops + IRO / med review commercial | **VantaHG** | **Paid door.** HG sells Med Review (VantaHG commercial lane). |
| Total Rewards / CHRO | **VantaTR** | Out of scope for this plan |
| Cross-bot coordination | **Onyx Health** | Health group chat |

## LOCKED 2026-09-20 — Med Review wedge (Jonah)

Do not soften. Packaging / GTM + product-boundary only. Customer-ready Phases 0–7 code path remains complete; this is **not** a new build phase.

- **Paid door = Med Review** (VantaHG commercial lane). HG sells med review.
- **VantaUM Brief Engine / utilization management is included free only when the buyer uses Vanta med review.** Included under that HG med-review contract.
- **Not a standalone free UM SKU.**
- **Not available free if they use another shop’s med review.**
- UM still owns Brief Engine SoR and tech. Do not merge GTM into a single SKU or move SoR ownership to HG.
- Compute COGS planning band **~$0.05–$0.15 per review** vs **~$1 internal budget** (estimate; not measured COGS).

### Entitlement (code)

Free UM Brief Engine access requires published `client_config.vanta_med_review_contract=true` (buyer uses Vanta med review). `med_review_provider=third_party` never grants free UM. Guard: [`lib/entitlements/um-brief-engine.ts`](../../lib/entitlements/um-brief-engine.ts). Default for a newly published config is **false** / `none`. Synthetic staging tenant is seeded `true` / `vanta` so demo packs stay on the Vanta shop.

## Explicit non-goals for first customer

- Multi-bot CX swarm (prove 1 bot × ~10 accounts first).
- Deep EHR / Epic bidirectional.
- Full ERP / claims adjudication.
- Replacing the client’s existing CM platform.
- Auto-approve without MD on live cases.

## Success metric for “ready”

One paying client live on the north-star loop with BAA path proven, three role views usable, ledger + 5 reports, CM handoff via webhook/CSV.

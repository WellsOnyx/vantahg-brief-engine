# 01 — Product boundary & ownership

## What is included (under UM’s Vanta med-review contract)

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

Free UM Brief Engine access requires published `client_config.vanta_med_review_contract=true` and `med_review_provider=vanta` (buyer uses Vanta med review under UM’s contract). `med_review_provider=third_party` never grants free UM. Guard: [`lib/entitlements/um-brief-engine.ts`](../../lib/entitlements/um-brief-engine.ts). Default for a newly published config is **false** / `none`. Synthetic staging tenant is seeded `true` / `vanta` so demo packs stay on the Vanta shop.

## Explicit non-goals for first customer

- Multi-bot CX swarm (prove 1 bot × ~10 accounts first).
- Deep EHR / Epic bidirectional.
- Full ERP / claims adjudication.
- Replacing the client’s existing CM platform.
- Auto-approve without MD on live cases.

## Success metric for “ready”

One paying client live on the north-star loop with BAA path proven, three role views usable, ledger + 5 reports, CM handoff via webhook/CSV.

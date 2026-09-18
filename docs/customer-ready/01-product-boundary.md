# 01 — Product boundary & ownership

## What VantaUM sells (customer-facing)

| Offer | Included | Not included (yet) |
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
| UM Brief Ops + CX | **VantaUM** | Auth, appeals, client/CX views |
| IDR Ops + IRO / med review commercial | **VantaHG** | Separate door unless Jonah locks a bundle later |
| Total Rewards / CHRO | **VantaTR** | Out of scope for this plan |
| Cross-bot coordination | **Onyx Health** | Health group chat |

**Considering (not locked):** “Include Brief Engine with Med Review.” Until Jonah locks it: Med Review stays HG; Brief Engine remains UM SoR. If locked later, rewrite this file and `10-implementation-commits.md` ownership rows — do not silently merge GTM.

## Explicit non-goals for first customer

- Multi-bot CX swarm (prove 1 bot × ~10 accounts first).
- Deep EHR / Epic bidirectional.
- Full ERP / claims adjudication.
- Replacing the client’s existing CM platform.
- Auto-approve without MD on live cases.

## Success metric for “ready”

One paying client live on the north-star loop with BAA path proven, three role views usable, ledger + 5 reports, CM handoff via webhook/CSV.

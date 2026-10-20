# 17 — Exclusive Med Review pivot (Oct 19, 2026)

**Status:** Customer-facing repositioning. No line-firewall code. No IRO case lifecycle.  
**Canonical boundary:** [`01-product-boundary.md`](01-product-boundary.md).  
**Entitlement keys unchanged:** `vanta_med_review_contract`, `med_review_provider`. Denial codes unchanged.

## What this slice changes

The only product these surfaces sell is **Vanta Med Review**. The Brief Engine is the shared engine under IDR, IRO, and Medical Review. It is included only under a paid Med Review contract. It is not a standalone UM SKU, and it is not included when another shop performs the review.

The 2026-09-21 platform sentence that limited VantaHG to IRO and IDR is **superseded**. Vanta HG runs three firewalled lines: IDR, IRO, and Medical Review. A Med Review contract does not open IRO or IDR.

Retired sales paths redirect to the Med Review application (`/signup-tpa`):

| Path | Destination |
|------|-------------|
| `/um` | `/signup-tpa` |
| `/products/um` | `/signup-tpa` |
| `/brief-engine` | `/signup-tpa` |
| `/ai-um` | `/signup-tpa` |
| `/utilization-management` | `/signup-tpa` |
| `/sign-up` | `/signup` (staff access request; unchanged) |

`/demo` and `/stoploss` stay. Both are labelled synthetic. `/stoploss` is not a live IDR feed. Stop-loss legal review is still open (IDR data use, IDRE conflict, InterQual, VHG trademark). See [`16-vhg-score-demo.md`](16-vhg-score-demo.md).

Internal file names (`um-price-card.ts`, `um-brief-engine.ts`) and ledger SKU strings stay. Renaming them would break the contract keys this slice keeps.

## What this slice does not change

- **Line firewall.** Company + line-of-business checks, cross-line denial, and intake routing out of a line’s queue land in the parallel IRO portal slice. This PR will build on that later. Decision (b) — one system with locked-off lines versus separate systems — stays open. Copy here assumes one commercial story and does not lock deploy topology.
- **IRO case lifecycle.** No intake-to-billing IRO workflow, no state-settings engine, no fee schedule.
- **PR #83** (`cursor/iro-panel-credentialing-9b9e`). Draft, IRO-only, one clinical approver. Do not merge it. The shared record and the separate IRO four-approver layer are in [`19-shared-credentialing.md`](19-shared-credentialing.md).
- **Med Review price card dollars.** Platform default $1.50 PMPM and clinical tiers stay. The open question stays open: Med Review does not waive the platform fee unless an explicit fat-TPA waiver. Do not guess.
- **IRO fees.** No preliminary fee amounts are compiled into this repo.
- **Vendors.** No EMR, mailing, phone, storage, or credentialing vendor is chosen.
- **`/demo` and `/stoploss` behavior.** Synthetic data only.

## Where open decisions plug in

| # | Decision | Plug-in already in this repo | Not chosen here |
|---|----------|------------------------------|-----------------|
| (a) | EMR link vs standalone intake | Standalone intake already exists: eFax, email, upload, external API, Gravity Rail (`POST /api/intake/gravity-rail`). An EMR connector would sit behind that intake, off by default. | No EMR vendor. No live EMR sync. |
| (b) | One system with locked-off lines vs separate systems | Packaging and the existing tenant RBAC stay one system. Line tags and server-side cross-line denial are the parallel IRO slice. | This PR does not pick a topology. |
| (c) | Mailing vendor (regular + certified) | `lib/adapters/email` sends determination mail. A certified-mail adapter would implement the same send/track shape, with a manual fallback. | No mailing vendor. |
| (d) | 24/7 phone line | No telephony module. A later adapter would attach case-linked messages. The Tennessee requirement belongs to the IRO slice. | No phone vendor. |
| (e) | File storage location + BAA signer | `lib/adapters/storage` and [`06-hipaa-baa-path.md`](06-hipaa-baa-path.md). Synthetic fixtures only until a BAA and a location are signed. | No BAA signer. No live PHI. |
| (f) | Vendor vs delegated credentialing | Provenance (Vanta-verified vs vendor-attested) is stored per item on the shared credential record. See [`19-shared-credentialing.md`](19-shared-credentialing.md). The choice of model stays open. | No credentialing vendor. No delegation policy. |

PDF questions that are not lettered (a)–(f) stay open too: billing inside the portal versus a fed ledger, and shared credentialing versus built-in. This slice does not answer them. The existing Med Review ledger (`lib/billing/`) is the Med Review price card only. It is not an IRO fee schedule and must not be copied into one.

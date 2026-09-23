# VantaUM AI-assisted UM — unit economics rate card

**Status:** LOCKED 2026-09-23. Planning case only. Commercial doc. Not a new SKU and not a code change.

Canonical price/cost card for VantaUM Med Review. Ledger mechanics stay in [`07-billing-and-tracking.md`](07-billing-and-tracking.md). Packaging lock stays in [`01-product-boundary.md`](01-product-boundary.md). Entitlement gate unchanged: `lib/entitlements/um-brief-engine.ts`.

## Packaging (do not reopen)

- **VantaUM sells Med Review** as the paid wedge.
- **Brief Engine / UM automation is free only** under a Vanta med-review contract (`client_config.vanta_med_review_contract=true` and `med_review_provider=vanta`). No standalone free UM SKU. No free UM with a third-party review shop.
- **VantaHG = IRO + IDR only.** Not the med-review commercial door.
- **Optum frozen** (no outreach).
- **Rules-only / auto is not billed.** That is Brief Engine value under the med-review contract, not a paid review SKU.
- **Nurse, physician/MD, and external peer are billed.**

## Planning case

**333k employees / 500k covered lives / 750k auths per year**

= **2.25 auths per EE / yr**; **1.50 auths per life / yr**

Note: if dependents run a normal **2.2 lives/EE = 733k lives** → 750k auths = **1.02 PMPY**.

## What gets billed

| Path | Billed? |
|------|---------|
| Rules-only / auto | **Not billed** |
| Nurse | **Billed** |
| Physician / MD | **Billed** |
| External peer | **Billed** |

## Base mix on 750k inbound

| Path | Share | Volume |
|------|-------|--------|
| Rules | 50% | 375k |
| Nurse | 38% | 285k |
| Physician | 9% | 67.5k |
| External | 3% | 22.5k |

**Billable reviews = 375k (50%).**

## Price / cost card

Charge / variable cost / contribution per review.

| Path | Charge | Cost | Contribution |
|------|--------|------|----------------|
| Rules | $0 | $3 | –$3 |
| Nurse | $85 | $35 | $50 |
| Physician | $200 | $80 | $120 |
| External | $350 | $280 | $70 |

Vendor retail comparison at **$150 / $300 / $400 ≈ $70M+**. This card is **~30–40% under**.

## Annual P&L — base

| Path | Revenue | Variable cost |
|------|---------|----------------|
| Nurse | $24.23M | $9.98M |
| Physician | $13.50M | $5.40M |
| External | $7.88M | $6.30M |
| Rules | $0 | $1.13M |
| **Total** | **$45.61M** | **$22.81M** |

**Contribution $22.80M.**

## Unit rates (333k EE / 500k lives)

| | PEPM (333k EE) | PMPM (500k lives) |
|--|----------------|-------------------|
| Billed UM | $11.42 | $7.61 |
| Variable gross | $5.72 | $3.81 |
| After criteria + platform + intake (~$2.0–3.5M) | ~$4.80 | ~$3.20–3.50 |

If **733k lives:** **$5.19 PMPM billed** / **~$2.20–2.50 PMPM net**.

## Mix sensitivity (same prices)

| Case | Auto share | Revenue | Gross | PMPM billed | PEPM billed |
|------|------------|---------|-------|-------------|-------------|
| Lean | 60% auto | $36.1M | $17.7M | $6.02 | $9.04 |
| Base | 50% | $45.6M | $22.8M | $7.61 | $11.42 |
| Heavy | 40% auto | $55.2M | $27.9M | $9.20 | $13.81 |

## What eats the $22.8M gross

- MCG / InterQual **$0.25–0.70 PMPM**
- Platform + AI + ePA **$0.15–0.40 PMPM**
- Intake staff **$1.5–3.0M**
- Appeals / UR licenses / MD W-2 vs 1099
- Gold-carding and a rising auto rate **shrink billable volume on purpose**

**Planning net: $12–16M** (~**$2.00–2.70 PMPM** / ~**$3–4 PEPM**).

UM is its own line. **$12 PEPM TPA admin cannot absorb $11.42 PEPM UM.**

## Operating targets

- Auto **≥55%** in 12 months
- Nurse **≤18 min**
- MD **≤8%** of inbound
- External **≤2.5%**
- First-pass **≥90%**
- Price band: nurse **$75–95** / MD **$175–225** / external **cost + $50–75**

## Traps

1. **Auto-rate is the business.** +10 pts auto drops **~$7–9M revenue** and only **~$1M cost**.
2. **Validate 750k inbound** by service category against the live book. If volume is **~400k**, then **~$24M revenue / ~$6–8M net**.
3. **Do not mix denominators.** Brokers quote **PEPM**. CFOs, stop-loss, and UM vendors quote **PMPM**.

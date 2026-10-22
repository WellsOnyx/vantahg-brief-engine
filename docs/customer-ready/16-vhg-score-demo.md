# 16 — VHG Score demo

Synthetic walkthrough only. No live PHI. Default off until `ENABLE_VHG_SCORE_DEMO=true`.

Published path: [https://vantaum.com/stoploss](https://vantaum.com/stoploss)

The price card, billing wire, and packaging guard are unchanged. Vanta Med Review is still the paid product. This demo does not add a fee and does not open IRO or IDR. The cases on the page are synthetic. The Likely IDR Contested Score is calibrated only on public CMS Federal IDR data. It is not a live IDR feed. Legal review is still open on IDRE conflict, InterQual, and the VHG trademark. Named certified-entity comparison is not built. Draft PR #83 (IRO credentialing panel) is not part of this demo and is not merged.

## What Jonah can click

1. `/stoploss` — stop-loss partner dashboard. Public on the marketing host so the link does not ask for a login. Data is synthetic. Year, quarter, month, and day drill-down, with YTD / 90 / 30 / today. The page polls `GET /api/stoploss/aggregate` and labels itself Demo, synthetic data.
2. `/stoploss/review/vhg-mr-0101` — one med-review case with a **criteria result (demo)** beside **VHG™** (Likely IDR Contested Score, ranking, top 3 drivers).
3. `/demo` — physician review step shows the same VHG™ card next to the criteria result. The existing intake → brief → determination steps stay in place.
4. `/portal/stoploss` — same dashboard behind the app session. API allows `stoploss_partner`, `admin`, and `ceo`.
5. `/med-review/[id]` — when the flag is on and the viewer is signed in, the same two panels load from `GET /api/vhg/panel`. Unknown case ids get an illustrative profile. The clinical packet is not an input to the score.

Switch clients on the dashboard:

- Northwind Synthetic Benefits (`syn-vhg-med-review`) has `vanta_med_review_contract=true` and `med_review_provider=vanta`. Rows show.
- Harbor Synthetic Benefits (`syn-vhg-no-contract`) fails the existing Brief Engine entitlement check. The page keeps the banner and shows no case rows.

## One command

```bash
npm run demo:vhg
ENABLE_VHG_SCORE_DEMO=true npm run dev
```

Open `http://localhost:3000/stoploss`.

`npm run demo:vhg` rewrites `fixtures/vhg/idr-patterns.redacted.json` from the generator. That file is the redaction proof. It is not a score input. The command does not connect to a database.

## Data flow

```
CMS Federal IDR public use files (2024 Q3, 2024 Q4, 2025 Q4)
+ data dictionary + supplemental tables (2024 Q4 through 2025 Q4)
        │  scripts/cms-idr/fetch_public_idr.py
        ▼
data/cms-idr/manifest.json  (URL, as-of date, sha256)
data/cms-idr/derived/feature-rates.json
        │
        ▼
lib/vhg/score.ts  (public log-lifts, demo_not_validated)
        │
        ├─ med review case  →  criteria result (demo) + VHG™ ranking + Likely IDR Contested Score + top 3 drivers
        └─ stop-loss dashboard  →  counts, exposure, stop-sign list, trend
```

The Likely IDR Contested Score is a 0–100% advisory index. Ranking labels are Low under 40, Moderate from 40, and High from 70. It is not a filing rate: CMS publishes disputes, not the claim universe those disputes came from. The panel shows the top 3 drivers. Drivers cite public CMS features: network status under 45 CFR 149.510, service code, state initiation share, place of service, provider type, offer-to-QPA band, and unnamed outcome dispersion. See [`21-vhg-cms-public-calibration.md`](21-vhg-cms-public-calibration.md).

Visible copy uses `VHG_BRAND` (`VHG™`) from `lib/vhg/brand.ts`. The mark is not part of routes or code identifiers.

The physician still decides. The panel says so. The score does not approve, deny, or file an IDR dispute.

## Redaction

`lib/vhg/redact.ts` runs on the synthetic filings before the pattern file is written.

Removed: patient name, date of birth, member id, street, city, postal code, provider person name, NPI, claim number, and the raw record id.

Kept, coarsened: service and dispute dates as `YYYY-MM`. Billed and QPA amounts collapse to a ratio. State, specialty, CPT, service line, facility type, encounter, network status, and IDR outcome stay, because those are the pattern features.

This is a Safe Harbor-style strip for a demo, not an expert determination and not a certification that a live extract would pass HIPAA.

## Gating

| Gate | Behavior |
| --- | --- |
| `ENABLE_VHG_SCORE_DEMO` | Off unless the value is `true`. Pages and APIs return the off state or 404. |
| Med review entitlement | Dashboard rows render only when `evaluateUmBriefEngineAccess` grants access. That function is unchanged. |
| Role | `GET /api/vhg/stoploss` allows `stoploss_partner`, `admin`, `ceo`. The public `/stoploss` page is the synthetic showcase and does not read a session. |
| Spine | `stoploss_partner` maps to the client lens, so it does not open the med-review packet view. |

Banner on every dashboard state: **Included at no charge with Vanta Med Review**.

## Open compliance items

Do not treat this demo as a go-live clearance.

1. **HIPAA de-identification.** Live IDR extracts need a documented Safe Harbor process or an expert determination. Month/year dates, state, and rare CPT combinations can still be quasi-identifiers. This repo only proves the strip on synthetic rows.
2. **IDR data-use restrictions.** The score uses the CMS Federal IDR public use files and supplemental tables only. It does not train on private filings, corrected determinations, or partner templates. Those public files still have CMS use terms. Read them before treating the score as anything other than an advisory demo.
3. **BAA with stop-loss partners.** A partner dashboard that can be tied back to a plan or a case needs a BAA (and a minimum necessary story) before any real row is shown. The published page is synthetic on purpose.
4. **InterQual license.** The case view says **criteria result (demo)** and uses invented placeholder lines. It is not InterQual, MCG, or any other licensed criteria product. Do not paste licensed criteria into this module.
5. **Trademark.** Pages render the brand as **VHG™** through `VHG_BRAND`. Filing the mark is still an open legal step before treating it as a registered product name.

## Not in this demo

- No change to `lib/billing/um-price-card.ts`, statement math, or packaging guards.
- No live IDR feed. The weights are fit on public CMS files and are not a validated predictor. Private case rows are not a training input.
- No Optum outreach.

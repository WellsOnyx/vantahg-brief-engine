# 21 — VHG™ score, public CMS calibration

The Likely IDR Contested Score on `/demo` and `/stoploss` is an advisory 0–100% index. Ranking is Low (under 40), Moderate (40–69), and High (70 and above). The physician decides. The score does not determine medical necessity and does not file a dispute.

It is fit only on public CMS Federal IDR files. It does not read private case tables, case buckets, corrected determinations, training notes, partner templates, or the synthetic IDR rows used to prove redaction.

## What the number is

CMS publishes disputes that reached a payment determination. It does not publish the claims that never became a dispute. The score is a relative index of how common a profile is inside those public disputes, plus how often the provider offer prevails in that slice. It is not a probability that a claim will be filed in IDR.

The 0–100 display is anchored on two public profiles: the most common out-of-network dispute in the files sits near 80, and an in-network office visit in a low-volume state sits near 20. Those anchors are not private cases and they are not the demo packets.

`model_id` is `vhg-score-cms-puf-v1`. `model_status` stays `demo_not_validated`. `data_source` is `CMS public IDR PUF`. Each score carries the file id, period, published-as-of date, and sha256 of the public files it used.

## Public files

Catalog version `2026-10-22`. Page: [CMS No Surprises Act reports](https://www.cms.gov/nosurprises/policies-and-resources/reports).

`npm run cms-idr:fetch` downloads a file only when it is missing, checks sha256, writes `data/cms-idr/manifest.json`, and rebuilds `data/cms-idr/derived/feature-rates.json`. Raw workbooks are gitignored. The manifest and the derived table are the committed artifacts.

Line items counted: **3,051,694**, from the OON emergency / non-emergency sheets and the air ambulance sheets for 2024 Q3, 2024 Q4, and 2025 Q4. The QPA-and-offers sheet is skipped so the same determination is not counted twice. Provider prevailing rate across those line items: **84.4%**.

| File | Period | Published as of | sha256 |
| --- | --- | --- | --- |
| Federal IDR PUF | 2024 Q3 | 2025-05-28 (portal 2025-03-18) | `64c51fd4238562a006f8d6f5427f840fc85b9dc79c861dcd74a65ec5f9c7c3ac` |
| Federal IDR PUF | 2024 Q4 | 2025-05-28 (portal 2025-03-18) | `a5bdfbc953bce1c25d3f6b3adb20378978c021ffb6187b5dc830b8d38a02fdf1` |
| Federal IDR PUF | 2025 Q4 | 2026-07-22 (portal 2026-01-26) | `60cac5a2c8af73418312974be14f7e225d560b0d2faed2bf3e20688dc317ada9` |
| Data dictionary | current with the July 22, 2026 release | 2026-07-22 | `dcdb3c2082df311778589652e71bf3ff47d3d3a92650fbd0adebba0a3f96bf76` |
| Supplemental tables | 2024 Q4 | 2025-05-28 | `0f652b1d24c5d194ca0a5b3cdbcba3dc681ee704a0a1e20051932b893d0cd6ca` |
| Supplemental tables | 2025 Q1 | 2026-01-21 | `6476de4fee9315847d832191f35fca1769fea2b13adb065788e8aebffed510f9` |
| Supplemental tables | 2025 Q2 | 2026-01-21 | `27a78801aba74f2ff51befa1c25b84bddad2f3e58101d0ba444c19cb0dafc5d3` |
| Supplemental tables | 2025 Q3 | 2026-07-22 | `e24e8b9a884077c4ae2a5cf7ee8634a0e1d91ada19344a378e889cc57b6b456e` |
| Supplemental tables | 2025 Q4 | 2026-07-22 | `69a819c66ac30d9c46eaf1a8af41f8608e7616183e8c11bb8bad373999be1aa8` |

General-information PDFs for the PUF and the supplemental tables (both updated July 22, 2026) are downloaded with the same script and recorded on the manifest. They are documentation, not rows in the rate table.

Supplemental tables used: party type (Table 1), state initiations (Table 7), payment outcomes (Table 12), QPA cost bands (Table 13), and specialty median prevailing offer (Table 14). Initiating-party names are not read.

## Features

Drivers cite these public features:

- Network status. Federal IDR is for qualified out-of-network items (45 CFR 149.510). In-network care is outside that path, so the index stays low.
- Service code. Share of published line items and the provider prevailing rate, shrunk toward the provider-type bucket when the code is rare.
- State. Share of dispute initiations in the supplemental tables.
- Place of service. Share of published line items, compared with places that appear at least 1,000 times. Rare place codes are not the baseline.
- Provider type. Bucket share and prevailing rate. The provider-type sentence can add the 2025 Q4 Table 14 median prevailing offer for that specialty.
- Offer-to-QPA band. Under 1.5×, 1.5–2.5×, 2.5–5×, and over 5× QPA. On the line-item sheets the offer is already a percent of QPA. The 2024 Q4 supplemental medians are Excel percentages and are stored as percent of QPA.
- Outcome dispersion. For 2025 Q4 only, the spread of provider win rates across certified entities for the same service code, state, and case type. The score says how wide that spread is and how many entities are in it. It does not name them. There is no comparison view by entity.

One certified entity is left out of that spread. Its rows still count in the overall rates. Its name is not stored, shown, or logged. Named entity comparison is not built. That decision is still Jonah's.

Line-item payment determinations are closed outcomes. Settlements are not in that file, so the lookup's settled count is 0.

## Rules and guidance this calibration follows

The public files describe the federal independent dispute resolution process under the No Surprises Act. The score cites the rules below. It does not restate them as legal advice.

- Qualifying payment amount: 45 CFR 149.140, from the July 13, 2021 interim final rules, Requirements Related to Surprise Billing; Part I, 86 Fed. Reg. 36872.
- Federal IDR process: 45 CFR 149.510, from the October 7, 2021 interim final rules, Requirements Related to Surprise Billing; Part II, 86 Fed. Reg. 55980.
- August 26, 2022 final rules, Requirements Related to Surprise Billing, 87 Fed. Reg. 52618.
- CMS Federal Independent Dispute Resolution (IDR) Process Guidance for Disputing Parties, including the 2023 updates, on [cms.gov/nosurprises](https://www.cms.gov/nosurprises).
- CMS Consolidated Appropriations Act, 2021 FAQs. The PUF general information (updated July 22, 2026) points readers to Parts 62, 67, and 69 for the QPA methodology after *Texas Medical Association v. HHS* (TMA III) and the Fifth Circuit's partial reversal.
- Federal IDR PUF general information and data dictionary, updated July 22, 2026.

## What is refused

- Private case files, corrected determinations, training notes, and partner template text are not ingested.
- Dispute numbers, NPIs, emails, phone numbers, and certified-entity names are not written to the derived table, the score, the UI, or logs.
- A test fails if the score module's training path points at private case tables, S3 case buckets, or the synthetic filing generator.
- A separate check, scoped to this score module, fails on real-looking dispute numbers and PHI patterns. It does not scan the rest of the repo.

## Still open

- Named certified-entity comparison, including any view that would rank entities. Not built. Waiting on Jonah.
- The index is not a validated predictor and not a claim-level filing rate.
- Legal review is still open on IDRE conflict, InterQual, and the VHG trademark. See [`16-vhg-score-demo.md`](16-vhg-score-demo.md).

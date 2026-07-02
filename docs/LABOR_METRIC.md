# Labor-Reduction Metric — CANONICAL

> **Status: CANONICAL (approved 2026-07-02).** Every stream and consumer computes
> against this. **Weights are ESTIMATES pending calibration** (`weights_basis =
> "estimated_pending_calibration"`). Do NOT present any output as *measured* until
> calibrated from real time-motion data at the operational MVP onsite.

## Contract (stable — do not fork)

- **Canonical formula + weights:** `lib/labor-metric.ts` (single source of truth).
- **Synthetic harness reads it via:** `lib/synthetic/labor-metric.ts` (a thin re-export of the canonical module, so it computes **identical** percentages).
- **Per-case cockpit field:** `cases.labor_metric` and `cases.confidence_resolution` (types in `lib/types.ts`).
- **Audit surface:** `lib/labor-metric-record.ts` emits a PHI-safe `labor_metric_computed` event; flag `ENABLE_LABOR_METRIC` (default off).

---

## Metric 1 — Labor-reduction %

**Question:** for one case, how much of the total work did the engine do on its own vs. what a human had to do? Output: **"X% engine-labor, Y% human-judgment"** (X + Y = 100).

- **Labor unit (LU):** estimated manual-minutes a step would take by hand.
- **Attribution per step:** each step has a `weight` (total LU) and an `engineShare` (LU the engine carries). `humanShare = weight − engineShare`.
  - pure engine → `engineShare === weight`
  - pure human → `engineShare === 0`
  - **hybrid (SPLIT)** → `0 < engineShare < weight`: the engine gets the drafting labor, the human gets the judgment layer. Applies to concierge validation and clinical/panel review. *(Decision locked 2026-07-02.)*
- **The fraction:**
  - numerator = Σ `engineShare` over all steps
  - denominator = Σ `weight` over all steps
  - **labor_reduction_pct = round(engine ÷ total × 100)**, `human_judgment_pct = 100 − labor_reduction_pct`.
- **Invariant (95% rule):** the determination step is always `engineShare = 0`, so the metric can never read 100% engine.

### Canonical UM step table (estimated weights)

| Step | weight | engineShare | humanShare |
|---|--:|--:|--:|
| Intake / OCR | 6 | 6 | 0 |
| Data extraction | 8 | 8 | 0 |
| Dedup | 2 | 2 | 0 |
| Brief generation | 12 | 12 | 0 |
| Fact-check | 5 | 5 | 0 |
| Routing / SLA | 2 | 2 | 0 |
| Concierge validation *(hybrid)* | 3 | 1 | 2 |
| Clinical review LPN/RN *(hybrid)* | 10 | 4 | 6 |
| **Determination** *(pure human)* | 4 | 0 | 4 |
| Letter render | 3 | 3 | 0 |
| Audit | 1 | 1 | 0 |
| **Totals** | **56** | **44** | **12** |

**→ 44 / 56 ≈ 79% engine-labor, 21% human-judgment.** (Medical Review mirrors UM with a panel reviewer; Payer IDR drops the clinical tier and adds an attorney weight-of-evidence determination; IRO adds independence enforcement + an external independent reviewer. All defined in `lib/labor-metric.ts`.)

Live per-case computation starts from the estimated stream table and applies **actual overrides** (e.g. if a human had to re-do extraction, that step's `engineShare` drops), so the number reflects what actually happened as calibration data accrues.

---

## Metric 2 — Confidence-resolution rate

**Question:** what share of inbound cases did the engine lift to **≥85% directional confidence** (approve / deny / modify) with a **complete evidentiary brief**?

- **Per case (`confidence_resolution.resolved`):** `directional_confidence ≥ 85` AND `brief_complete === true` AND a directional `recommendation ∈ {approve, deny, modify}`. This is a property of the **engine's brief**, independent of the human's final determination.
- **Book-level rate:** `round(resolved ÷ inbound × 100)`.
- Threshold `CONFIDENCE_THRESHOLD = 85`. Same estimates-now / calibrate-later discipline.

---

## How one real case reads

Southwest TPA, MRI lumbar prior-auth (UM): engine handled intake, extraction, brief, fact-check, routing, letter, audit + the drafting share of validation/review (44 LU); the human handled the validation/clinical judgment + determination (12 LU). **"79% engine-labor, 21% human-judgment."** If the engine's brief hit 92% directional confidence with a complete brief recommending approve, the case is **confidence-resolved**.

*(All figures estimated, pending onsite calibration.)*

## Calibration path

Estimated weights ship now; real per-step manual-minutes get measured at the operational MVP onsite and replace the estimates. Until then, `weights_basis` stays `estimated_pending_calibration` and the numbers are never labeled "measured."

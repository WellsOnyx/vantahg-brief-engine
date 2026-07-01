# Labor-Reduction Metric — DRAFT (NOT canonical)

> **⚠️ DRAFT for Jonah's sign-off. Do NOT compute against this or treat it as canonical until approved.**
> Every stream (UM / IDR / IRO / Medical Review) and the synthetic harness will
> compute against this definition, so the numbers below (labor weights) are
> **illustrative placeholders** until calibrated from real time-motion data.
> No weight here is a claimed/measured result.

## The one-line question this answers

> "For this case, how much of the total work did the *engine* do on its own, and
> how much required a *human*?" Output: **"X% engine-labor, Y% human-judgment"** (X + Y = 100).

This is the number behind the doctrine "humans made superhuman by the AI is the product": the engine carries the labor, a credentialed human renders the judgment.

## Definitions

- **Labor unit (LU):** a calibrated measure of the manual effort a step would take *if a person did it by hand*, expressed in **standard clerical minutes**. Each pipeline step carries a **labor weight** = estimated manual minutes for that step. (DRAFT weights below; real values come from time-motion calibration.)
- **Step attribution** (per case, per step):
  - **ENGINE** — the step completed autonomously, no human input required → its weight counts as **engine labor**.
  - **HUMAN** — the step required a person to add judgment, correction, validation, or a determination → its weight counts as **human labor**.
  - **HYBRID** — the engine drafts and a human reviews. The weight is **split**: the drafting share → engine, the review/judgment share → human.

## The fraction

- **Numerator (top)** = Σ engine labor units across every step the engine did autonomously (plus the engine share of hybrid steps).
- **Denominator (bottom)** = Σ *all* labor units for the case = engine labor + human labor.
- **Labor-reduction %** = numerator ÷ denominator.
- **Human-judgment %** = human labor ÷ total = 1 − labor-reduction %.

## Non-negotiable invariant (the 95% rule)

The **determination step is ALWAYS human** — the engine never auto-decides a case. Therefore human labor is never zero and the metric can **never read 100% engine**. This is by design and encodes the clinical-safety rule directly into the number.

## Per-stream step tables (DRAFT weights, illustrative)

Streams share the chassis (intake → brief → criteria → routing → determination → letter → audit) and differ in a few steps/weights.

### UM / Medical Review

| Step | Manual-minute weight | Attribution |
|---|---|---|
| Intake / OCR | 6 | Engine |
| Data extraction | 8 | Engine |
| Dedup | 2 | Engine |
| Brief generation (criteria match) | 12 | Engine |
| Fact-check | 5 | Engine |
| Routing / SLA | 2 | Engine |
| Concierge validation of brief | 3 | Human |
| Clinical criteria review (LPN/RN) | 10 | Human |
| **Determination (clinical judgment)** | 4 | **Human (always)** |
| Letter render | 3 | Engine |
| Audit | 1 | Engine |

*(Medical Review adds panel-reviewer routing; determination weight sits with the panel reviewer.)*

### Payer IDR
As UM, minus clinical-tier review, plus **attorney weight-of-evidence determination** (Human, higher weight) and NSA-factor brief context (Engine).

### IRO / IRE
As UM, plus **independence enforcement** (Engine, small) and an **external independent reviewer determination** (Human).

## Worked example — one real case (illustrative)

Southwest TPA, MRI lumbar prior-auth (UM), using the DRAFT weights above:

- **Engine steps:** intake/OCR 6 + extraction 8 + dedup 2 + brief 12 + fact-check 5 + routing 2 + letter 3 + audit 1 = **39 LU**
- **Human steps:** concierge validation 3 + clinical review 10 + determination 4 = **17 LU**
- **Total:** 56 LU
- **Labor-reduction % = 39 / 56 ≈ 70%** → this case reports **"70% engine-labor, 30% human-judgment."**

## How it is captured (Part B, not yet built)

For every case: record the timestamp at each step, a per-step boolean (engine-autonomous vs human-touched), the weights, and the computed %. Surface via `lib/audit.ts` as a PHI-safe `labor_metric_computed` event (step ids, weights, durations, booleans only — never clinical content). Behind a flag.

## Open calibration questions (need Jonah's input before canonical)

1. **Weights:** measure real manual minutes per step (time-motion), or start with these estimates and refine?
2. **Hybrid split:** for concierge validation and clinical review, is the human share the *whole* step, or a split (engine drafted, human overlaid judgment)?
3. **Unit basis:** manual-minutes (effort) vs. count-of-steps (simpler) vs. wall-clock time (includes waiting — probably not).
4. **Does "engine-labor %" headline the case, the day, or the book of business?** (Per-case here; roll-ups average by case or by volume.)

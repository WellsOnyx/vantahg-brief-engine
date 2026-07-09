# Service-Line Throughput Model

**Purpose:** map how volume flows and where it bottlenecks across the five service lines, because each has a **different pipeline shape → different bottleneck → different cost center → different price**. A single "cases per day" number hides that UM-without-Med-Review and Credentialing barely touch the expensive stage, while UM-with-Med-Review and IRO/IRE live or die on human-review capacity.

Config in code: `lib/service-lines/config.ts`. Labor/cost step weights: `lib/labor-metric.ts`. Throughput hardening (the `brief_jobs` queue): task #2, design in §4.

---

## 1. The five lines at a glance

| # | Line | Our pipeline stops at | Determination owner | Cost center | Price basis | Our costly queue? |
|---|---|---|---|---|---|---|
| 1 | **UM with Med Review** | full — we decide | VantaUM clinician (LPN/RN/MD) | `cc_um_full` | per authorization | **Yes** (clinical tier) |
| 2 | **UM without Med Review** | after brief + concierge → **hand packet to client MRs** | client in-house | `cc_um_prep` | per authorization | **No** |
| 3 | **IRO / IRE** | full — independent reviewer decides | external independent reviewer | `cc_external_review` | per review | **Yes** (reviewer network) |
| 4 | **IDR** | full — attorney decides | VantaUM attorney | `cc_idr` | per case | **Yes** (attorney tier) |
| 5 | **Credentialing** | full — committee decides | VantaUM committee | `cc_credentialing` | per provider | **No** (PSV + committee, not clinical) |

The one distinction that drives everything: **whose people carry the expensive, capacity-bounded stage.** Lines 1/3/4 consume *our* human queue (each a different pool). Line 2 consumes *the client's*. Line 5 has no clinical stage at all.

## 2. Where each line bottlenecks

Two scarce resources exist: the **AI brief stage** (Anthropic-bound, elastic with money + backpressure) and the **human review queue** (headcount-bounded, the real ceiling). Each line stresses them differently.

| Line | Brief-stage load | Human-queue load (ours) | First thing that breaks under 11k/day-style burst |
|---|---|---|---|
| 1 UM w/ MR | 1 brief/case | LPN→RN→MD, capacity-bounded | **Our clinical headcount** (SLA-slack scoring already routes to it; add staff or briefs pile at `brief_ready`) |
| 2 UM w/o MR | 1 brief/case | none | **Only the brief stage** — no clinical ceiling on our side. This is the line that scales cheapest and fastest for us |
| 3 IRO/IRE | 1 brief/case | independent reviewer network + independence checks | **Reviewer-network capacity** + the independence wall's exclusion math |
| 4 IDR | 1 (heavier NSA) brief/case | attorney tier (small pool) | **Attorney capacity** — lowest-volume, highest-value; brief stage is not the constraint |
| 5 Credentialing | **0 briefs** | PSV turnaround (external verifications) + committee cadence | **PSV latency** (CAQH/NPDB/board round-trips — days, not seconds) and committee cadence, not compute |

**Consequence for capacity planning:** line 2 and line 5 are throughput-cheap on our side and should be sized against the *brief stage / PSV vendors* respectively; lines 1/3/4 must be sized against **headcount** (the hire-to-demand doctrine), because no amount of engine speed moves a human-decision ceiling. The engine's job on the capacity-bounded lines is to keep every human minute on judgment, never on assembly — which the labor-metric split already models (engine carries the drafting share; the human carries the judgment share).

## 3. Volume mixing (why a blended "cases/day" is the wrong unit)

At a book like Optum's ~250k auths/month, the mix matters more than the total:

- Shift volume from **line 1 → line 2** (client keeps their MRs) and *our* cost/throughput profile transforms: same intake + brief load, **zero clinical-queue load**, `cc_um_prep` instead of `cc_um_full`, higher margin per unit, and the line scales to burst with only brief-stage backpressure.
- **IRO/IRE and IDR** are low-volume, high-value, regulated-SLA lines — they never dominate throughput but each needs its own reviewer/attorney pool and its own SLA clock. Model them per-line, never blended into the UM number.
- **Credentialing** volume is measured in *providers per cycle* (initial + 36-month re-credential), not auths/day — a different denominator entirely, sized against PSV vendor throughput.

**Therefore the throughput model is per-line, not global.** The `brief_jobs` queue (§4) carries lines 1–4; each line's *human* stage is capacity-planned separately against its own pool; credentialing runs on its own PSV/committee cadence (§ `docs/CREDENTIALING_PLAN.md`).

## 4. The shared throughput chassis (`brief_jobs` — task #2)

The audit found the real 11k/day risk: AI brief generation runs **inline in the request path** (or fire-and-forget on serverless, where it's silently killed). The fix is one queue that all brief-consuming lines share:

- Every intake (any channel, any of lines 1–4) does: validate → insert case → **enqueue a `brief_jobs` row** → return in ms.
- A cron worker drains `brief_jobs` with `claim_brief_batch(worker_id, batch_size)` — the same `FOR UPDATE SKIP LOCKED` + backoff + dead-letter pattern as the eFax pipeline and the partner-webhook worker we just shipped.
- Global concurrency limit + Anthropic 429 re-enqueue (honor the `retryable` signal the LLM layer already produces), so bursts smooth instead of failing.
- Case-number generation moves to a Postgres sequence (kills the racy `count(*)`), and rate limiting moves to a shared store.

After that, **line 2 scales to burst on this queue alone** (no downstream ceiling on our side), and lines 1/3/4 are gated only by their human pools — exactly where the business wants the constraint to be, because that's the constraint the price is set against.

`service_line` is stamped on every case at intake (derived from `case_type` + the client's contract flags: does this client buy Med Review from us, or keep it in-house?), so throughput dashboards, the labor metric, and the P&L all group by line for free.

## 5. What this unlocks operationally

- **Per-line dashboards**: volume, SLA posture, and cost roll up by `cost_center` — no blended averages hiding a bleeding line.
- **Per-line pricing** attaches to `price_basis` cleanly (per-auth for UM, per-review for IRO/IRE, per-case for IDR, per-provider for credentialing).
- **Capacity alarms** fire against the *right* resource per line (our headcount for 1/3/4, brief-stage/PSV for 2/5).
- **Contract flag → line routing**: a client who buys UM-with-MR vs UM-without-MR is one boolean on the client record that flips the case's `service_line`, its cost center, and whether it ever enters our clinical queue.

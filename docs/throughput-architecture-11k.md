# VantaUM Throughput Architecture — 11,000 Authorizations/Day

> **Status:** Proposal / spec for review (Jonah + Cole). No code written yet.
> **Author:** Claude (Opus 4.8) session, 2026-06-15.
> **Supersedes the scale target in CLAUDE.md** (currently "~1,400/day / 333k lives"). This is an **8× step up**.

---

## 1. The Goal (in Jonah's words)

> "Expand throughput to handle (easily) **11k authorizations per day**, **95% automated with AI**, so **30 concierges + 30 clinicians** (each with a **VA and a Claude account**) not only handle it with ease but find their jobs an **absolute delight, almost easy**."

**Critical reframe (Jonah, this session):** the 95% does **not** mean "95% of cases never see a human." It means:

> **Every case still gets a gamified human approval.** The AI does ~95% of the *work* on all 11k cases; a human gives a fast, satisfying blessing on each one. The ~5% that are genuinely uncertain get *real* scrutiny.

This is both more **delightful** (tap-to-approve, not chart-grind) and more **defensible** (every determination has a named human in the loop — strong for URAC/audit). It is the right design.

---

## 2. Two-Tier Gamified Approval — The Core Model

Every case flows into **one of two lanes**, decided by a Readiness Score (§4):

### Lane 1 — "Tap to approve" (~95% of cases)
High-confidence cases: AI brief passed fact-check, VantaUM criteria **met**, AI recommendation **high confidence**, no flags.
- Rendered as a **swipe/tap card**: patient · procedure · green criteria chip · AI recommendation.
- **One tap blesses it** (3–5 seconds). Audit logs the named human, case advances to determination.
- The human isn't doing chart review — they're confirming the AI's work on a clear case.

### Lane 2 — "Needs you" (~5% of cases)
Anything flagged: `human_review_recommended`, low confidence, criteria `not_met`/`partial`/`insufficient`, fact-check `warning`/`fail`, or a criteria-vs-recommendation conflict.
- Gets the **full review UI** (today's `components/ConciergeValidationForm.tsx`, with required ≥30-char reasoning).
- The hard cases get **more** attention precisely because the easy ones cost almost none.

### Why this keeps the job delightful
The volume math (§3) is only humane if the easy lane is genuinely a few seconds. The split is what converts "183 reviews/person/day" from a treadmill into "a stack that drains fast, with a few interesting ones."

---

## 3. Capacity Math (against REAL system numbers)

Verified from the repo this session:
- Concierge cap: **300 auths/week (~60/day)** — `supabase/migrations/016_delivery_org.sql:94` (`weekly_auth_cap DEFAULT 300`, hard cap 1000).
- Clinician daily cap: **12–18 cases/day** — `lib/demo-data.ts` (`max_cases_per_day`).
- Human gate today: `human_review_recommended = reviewReasons.length > 0 || overall_status !== 'pass'` — `lib/fact-checker.ts:627`.

### The headline math

| Metric | Value |
|---|---|
| Total auths/day | 11,000 |
| Team | 30 concierge + 30 clinician = 60 |
| **Gamified approvals/person/day** | **~183** (11,000 ÷ 60) |
| Over an 8-hr day | **~1 approval / 2.6 min** |
| Lane 2 (deep-dive) at 5% | 550/day → **~18 deep reviews / clinician / day** |

**18 deep reviews/clinician/day fits comfortably** inside the existing 12–18 `max_cases_per_day` cap *for the hard tier* — because Lane 1 taps don't consume that budget the way a chart review does.

### ⚠️ The number that decides everything: the real auto-pass rate
"95% Lane 1" is an **assumption, not a measurement.** If real-world briefs only clear the bar at, say, 80%:
- Lane 2 jumps to **2,200/day → 73 deep reviews/clinician/day** → the team drowns.

**So the #1 engineering lever is not headcount — it's driving the auto-pass rate up and measuring it.** See §7 (load test) and §6 (AI quality). Every 1% of auto-pass rate ≈ 110 cases/day moved off the deep-review queue.

---

## 4. Readiness Score — The Routing Brain

**The signals already exist** (verified in `lib/types.ts` + `lib/criteria/library.ts`). This is assembly, not invention:

| Signal | Source |
|---|---|
| `fact_check.overall_score` (0–100) + `overall_status` | `lib/fact-checker.ts` |
| `fact_check.human_review_recommended` + `review_reasons[]` | `lib/types.ts:353` |
| `ai_recommendation.recommendation` + `confidence` (high/med/low) | `lib/types.ts:280` |
| VantaUM criteria `verdict` (met/not_met/partial/insufficient) | `lib/criteria/library.ts:65` |

### New: `lib/routing/readiness-score.ts` (pure, testable)
```
lane(case): { lane: 'auto' | 'review', score: number, reasons: string[] }

AUTO (Lane 1) requires ALL of:
  - fact_check.overall_status === 'pass'
  - fact_check.human_review_recommended === false
  - criteria verdict === 'met'
  - ai_recommendation.confidence === 'high'
  - ai_recommendation.recommendation in ('approve')   // denials always get human eyes

REVIEW (Lane 2) otherwise, with reasons[] explaining why (drives the Lane-2 UI).
```
- **Tunable threshold** so you can dial the auto/review ratio as real data arrives.
- **Denials never auto-approve** — an adverse determination always gets explicit human reasoning (regulatory + ethical).
- Sibling pattern to the existing `DecisionReadiness` already on `/api/clinician/summary`.

---

## 5. What Breaks at 11k/Day (and the fix)

Three hard ceilings in today's code:

### 5.1 The AI pipeline is the throughput governor
- **Today:** brief generation runs **up to 3 passes on `claude-opus-4-6`** (`lib/generate-brief.ts:22`, `MAX_PASSES = 3`; model from `lib/llm/config.ts`).
- **At 11k/day:** ~33k Opus calls/day — expensive and latency-bound.
- **Fix — tiered models:** cheap/fast model (Haiku/Sonnet 4.x) for the easy majority; Opus reserved for hard cases + the self-critique pass. Route by a quick complexity pre-classify. This is the single biggest cost/latency win and the difference between viable and not.

### 5.2 The intake worker won't drain the queue
- **Today:** eFax worker claims **max 20 rows/run** via `claim_efax_batch` + `FOR UPDATE SKIP LOCKED` (`app/api/cron/efax-process/route.ts:56-57`).
- **At 11k/day:** ~460/hr average, with bursts much higher; 20/tick can't keep up.
- **Fix — fan-out:** `SKIP LOCKED` is *already* built for concurrent workers. Run N workers in parallel + higher cadence. No rewrite; it's a scaling config + multiple invocations.

### 5.3 Single Fargate task + single-AZ RDS
- **Today (verified live):** ECS desired=1/running=1; RDS `MultiAZ: false`, Postgres 15.8.
- **Fix:** ECS autoscaling (target-tracking on CPU/queue depth), RDS connection headroom (PgBouncer/RDS Proxy — the shim pools via `lib/db/pool.ts`), and Multi-AZ before contractual SLAs.

---

## 6. AI Quality = Throughput (the auto-pass lever)

Because Lane 1 size *is* the throughput story, AI quality work is throughput work:
- **Raise the auto-pass rate** via better extraction, better criteria matching (the VantaUM library + Cole's `lib/medical-qualifications/` RAG), and tighter self-critique — every point gained removes ~110 deep reviews/day.
- **Calibrate confidence** so `high` genuinely means safe-to-tap. A miscalibrated `high` is the one thing that makes tap-to-approve dangerous. Track post-hoc: of cases auto-approved, how many would a human have changed? Target < 1%.
- **Feedback loop:** Lane-2 human corrections become training/eval signal (the `ai_recommendation` physician-feedback field at `lib/types.ts:174` is the seed).

---

## 7. Prove It Before You Stake Contracts On It

A **synthetic load harness** that runs ~11k cases/day through the real pipeline (demo-mode safe) to **measure**:
1. **Real auto-pass rate** → validates whether 30+30 is the right number (or whether it's 20+20, or 40+40).
2. Pipeline latency + cost per brief under tiered models.
3. Worker drain rate under fan-out.
4. False-confident rate (auto-approved cases a human would have flagged).

This is the de-risking step. Everything else is an opinion until this runs.

---

## 8. The Human Layer — VA + Claude per Person

Out of scope for the first code, but the dashboards should be designed for it:
- **VA-delegatable Lane 2:** a clinician's VA can triage/prep the deep-review queue (gather missing docs, draft the reasoning) so the clinician makes the call faster. Dashboards should support a "prepped by VA" state.
- **Per-person Claude account:** for ad-hoc clinical research on the genuinely hard cases — sits beside the workflow, not inside it.
- Net effect: the human's job becomes *judgment on the hard 5%*, with everything else either auto-tapped or VA-prepped.

---

## 9. Phased Roadmap

| Phase | Deliverable | Unlocks |
|---|---|---|
| **0** | This doc, reviewed by Jonah + Cole | Aligned target |
| **1** | `lib/routing/readiness-score.ts` + tests | The two-lane split is provable |
| **2** | Gamified tap-to-approve UI (Lane 1) + Lane-2 deep-dive on `/clinician` + `/concierge` | The visible delight; demoable in demo mode |
| **3** | Load-test harness → **measure real auto-pass rate** | Confirms team sizing before contracts |
| **4** | Tiered AI pipeline (cheap model + Opus-on-hard) | Cost/latency survive 11k/day |
| **5** | Worker fan-out + ECS autoscale + RDS Proxy/Multi-AZ | Infra survives 11k/day |
| **6** | VA-delegation states + feedback loop | Human layer + continuous auto-pass improvement |

Phases 1–3 are the high-leverage, low-infra-risk core (and fully demoable). Phases 4–5 are the infra hardening that gates *real* volume. Phase 3 (the measurement) is the linchpin — it tells you if the whole model holds.

---

## 10. Open Questions for Jonah / Cole

1. **Auto-pass threshold:** start conservative (tighter Lane 1, more human review) and loosen as confidence calibration proves out? Recommended: yes.
2. **Denials:** confirmed that no denial ever auto-approves — every adverse determination gets human reasoning. Agreed?
3. **eFax vs portal/API at volume:** is 11k/day mostly eFax (OCR-bound, §5.2) or structured API/portal intake (cheaper, faster)? Changes the pipeline cost model — and ties to the Gravity Rails inbound-sync gap still open from earlier this session.
4. **Which model for Lane 1 briefs** — Haiku 4.5 vs Sonnet 4.6 — pending the load-test cost/quality numbers.
5. **VA tooling:** do VAs work *inside* VantaUM (need accounts + a delegated queue view) or in a side channel? Affects Phase 6 scope.

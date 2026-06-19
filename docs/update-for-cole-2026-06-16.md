# Comprehensive Update for Cole — 2026-06-16

> Everything from the recent Claude sessions on `feature/clinician-dashboard`,
> written so you can pick it up cold. STATE.md is partially stale (§6) — this
> doc reflects the **live, observed** state.

---

## 1. TL;DR

- **New work lives on `feature/clinician-dashboard`** → **[PR #28](https://github.com/WellsOnyx/vantahg-brief-engine/pull/28)** (OPEN, mergeable, not draft). Does **not** touch `app/login/` or `app/api/auth/*`, so it won't collide with your login fix.
- Shipped: clinician "My Day" dashboard, concierge ping center, VantaUM's own criteria engine (InterQual/MCG removed as the basis of review), and **two-tier gamified approval routing** toward an 11k/day target.
- **Prod is healthier than STATE.md says:** `app.vantaum.com` is UP, real-mode, `database: connected`, running image v6. (STATE.md still describes the old stale-v2/demo-mode world.)
- **342 tests pass; 26 fail — all 26 are pre-existing and stale (test drift, not product bugs).** Root cause in §5.

---

## 2. What shipped on the branch (in order)

| Commit | What |
|---|---|
| `a206f42` | Clinician "My Day" dashboard — EDF day planner + `/api/clinician/summary` |
| `df7e522` | Intake → concierge → clinician flow + VantaUM's own criteria engine |
| `ca5acb8` | `docs/throughput-architecture-11k.md` — the 11k/day plan |
| `8be7f2e` | Two-tier readiness routing (gamified tap-to-approve), Phase 1+2 |

### 2a. Clinician dashboard (`/clinician`)
`lib/clinician/day-planner.ts` — EDF (earliest-deadline-first) day plan: provably minimizes max lateness on a serial queue, so the `on_track`/`tight`/`at_risk` verdict is real, not a heuristic. Backed by `GET /api/clinician/summary?staff_id=`.

### 2b. Concierge ping center (`/concierge`)
Every intake channel funnels into one case engine; `lib/concierge/pings.ts:buildPings` surfaces active cases with no outbound first-contact touchpoint as "pings" (30-min callback target). `buildCallPrep` gives the concierge an opening line ("brief already prepared — this call is pure relationship"). `GET /api/concierge/pings` + `POST /api/concierge/touchpoints` (migration `027_concierge_touchpoints.sql`). **Note:** older git history references a different `027_gravity_rail_per_concierge.sql` not on this branch — **renumber one if both land.**

### 2c. VantaUM criteria engine (LOCKED decision, NOT InterQual/MCG)
`lib/criteria/library.ts` — versioned, provenance-stamped criteria sets (`VC-<code>-v<n>`) on the evidence-based `lib/medical-criteria.ts` content, with a `CriteriaSource` contract **your `lib/medical-qualifications/` RAG implements in production.** I scrubbed InterQual/MCG as the *basis* of review from the brief prompt, criteria references, demo data, and concierge copy — but **kept** `known-guidelines.ts` so the fact-checker can still flag *hallucinated* commercial cites.

### 2d. Two-tier gamified approval (the 11k/day model)
`lib/routing/readiness-score.ts:scoreReadiness()` routes every case into:
- **Lane 1 "tap to approve" (~95%):** clean cases — one-tap human blessing (3-5s).
- **Lane 2 "needs you" (~5%):** anything flagged — full review UI + reasoning.

**Hard guardrail: a denial NEVER auto-approves.** Surfaced on `/clinician` as a LaneBanner ("% of your day is a tap") + lane-aware chips. See `docs/throughput-architecture-11k.md` for the full architecture.

---

## 3. Intake reality (you asked about real vs stub)

| Channel | State |
|---|---|
| eFax (Phaxio) | **Real wiring**, gated on Phaxio creds (empty in prod vault) |
| Programmatic API `/api/external/submit` | **Real** — HMAC auth, dedup, stamps `intake_channel:'api'` |
| Portal / email / manual | **Real** |
| **Gravity Rails** | `lib/gravity-rails.ts` is a real **outbound** client (workspaces/chats/workflows). **GAP: no inbound path where a GR agent's intake auto-creates a case.** Today a GR workflow would have to POST to `/api/external/submit`. A purpose-built GR→case sync is the one real hole in the intake story — **not yet built.** |

---

## 4. AWS / production — observed live (profile `vantaum`, us-east-1)

- ECS `vantaum-prod-app`: desired=1 running=1 steady, task def **:14**, image **v6** (pushed 2026-06-02).
- `/api/health` → `{"status":"healthy","database":"connected"}` — **real mode, not demo.**
- HTTPS live (443+80 redirect). RDS available (PG 15.8, single-AZ). `vantaum.com` SES domain verified.
- Secrets SET: anthropic, hellosign (key+client), all 3 supabase, cron, gravity_rail. **EMPTY: meow_*, phaxio_*, google_vision, sentry_dsn.**

### Launch blockers (ordered)
1. **SES sandbox** (`ProductionAccessEnabled: false`) — hard blocker w/ 24-48h lead time. No email to non-verified addresses (magic links, determination letters) until granted. **Start the AWS ticket first.**
2. **Flag/creds mismatch:** `ENABLE_REAL_MEOW` / `ENABLE_REAL_EFAX` are ON but their creds are EMPTY — fill or flip the flags off so they stop asserting capabilities they lack.
3. **Sentry empty** — no prod error telemetry.
4. **Gravity Rails inbound sync** (§3).

---

## 5. The 26 failing tests — root cause (it's stale tests, not bugs)

A refactor pointed `isDemoMode()` at `hasSupabaseConfig()`. The 9 failing test files mock `hasSupabaseConfig: () => true` AND call `clearSupabaseEnv()` to exercise demo branches — so `isDemoMode()` now always returns false and the demo branches never fire (→ 401s / undefined `.from`). Two smaller drifts ride along: `getStorageAdapter()` became async (tests don't await), and `CognitoAdapter` got implemented (test still expects a throw), plus an ICS line-folding assertion. **Fix = update the tests** (mock `@/lib/demo-mode.isDemoMode` directly, await the storage factory, expect `{ok:false}` from Cognito, assert the folded ICS line). Product code is arguably *more* correct than the tests.

---

## 6. STATE.md is stale — trust live state over it

STATE.md's "MOBILE HANDOFF" / "HONEST AUDIT" sections describe a stale-v2-container + demo-mode world that **no longer exists**. Wrong-now claims: "container is stale/v2", "demo mode on prod", "zero SES identities", "HelloSign keys empty", "no HTTPS". All resolved. Worth reconciling those top sections — they're the first thing a fresh session reads.

---

## 7. Open questions for you + Jonah

1. **Auto-pass threshold** (`AUTO_FACT_CHECK_THRESHOLD`, default 90) — start conservative, loosen as confidence calibration proves out?
2. **Denials never auto-approve** — confirmed in code; agreed as policy?
3. **11k/day intake mix** — mostly eFax (OCR-bound, expensive) or API/portal (cheaper)? Drives the tiered-model cost plan + ties to the GR inbound gap.
4. **Merge PR #28 now or after your login fix?** No file overlap, so either order is clean.

---

## 8. Suggested next steps (not yet done)

- **Phase 3:** load-test harness to *measure* the real auto-pass rate (the number that decides if 30+30 is the right team size).
- **Phase 4:** tiered AI pipeline (cheap model for easy cases, Opus for hard + critique) — the real cost/latency ceiling at 11k/day.
- **Gravity Rails inbound case-sync** (§3).
- **Fix the 26 stale tests** so CI can guard the cutover.

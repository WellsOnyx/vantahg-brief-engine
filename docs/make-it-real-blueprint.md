# VantaUM — "Make It Real" Blueprint

> **Status:** Build spec for review (Jonah + Cole). Written 2026-06-16.
> **Intent (Jonah):** "No more vanity branding — make it real." Stop the
> demo/marketing facade; close the gaps that make this an actual working
> product. This is the ordered Lego-block plan.
>
> Honest baseline from this session's audits: **prod is real-mode**
> (`database: connected`, image v6) — but several integrations are
> facades (silent-success stubs, flags-on/creds-empty), the Gravity Rails
> inbound sync doesn't exist, billing is PEPM-only, and 26 tests are
> stale so CI can't guard a cutover.

---

## The Four Blocks (Jonah's model)

```
BLOCK 1 — ONE DOOR              BLOCK 2 — THE <2-MIN PIPELINE
fax ─┐                          intake → concierge dashboard
email ─┤                                 (triggers follow-up)
phone ─┤                          → AI Brief Engine
manual/portal ─┼──► one case          → VantaQual (our own qualifications)
gravity rails ─┤    engine         → clinician dashboard
bpo call center ┘                      → tap-to-approve  OR  deep-dive

BLOCK 3 — THE FORK              BLOCK 4 — BILLING AS A PRODUCT
approved → downstream care      PE/PM  |  PM/PM  |  per-auth
          tracking + outcomes   per-client rates, each different
denied  → appeal / IRO journey  → track all of it
          (needs mapping)       → accurate COGS (human labor: concierge
                                   + clinician time per auth)
```

---

## Block 1 — One Door (intake)

**Goal:** every channel lands in the same case engine, for real.

| Channel | Today | To make real |
|---|---|---|
| Portal / manual | ✅ Real (`POST /api/cases`) | — |
| Programmatic API | ✅ Real (`/api/external/submit`, HMAC, dedup) | — |
| eFax (Phaxio) | 🟡 Real code, creds empty in prod | Fill Phaxio + Vision creds OR flip `ENABLE_REAL_EFAX=false` |
| Email | 🟡 Real route, depends on inbound mail wiring | Verify inbound path end-to-end |
| **Gravity Rails** | 🔴 **Outbound client only — no inbound case-create** | **Build `POST /api/intake/gravity-rails`: auth'd inbound webhook → normalize → same dedup → case (`intake_channel:'api'`/`gravity_rails`)** |
| Phone / BPO call center | 🔴 No structured intake | Define the BPO hand-off: a call-center rep submits via the portal form or a dedicated `/api/intake/bpo` endpoint stamping `intake_channel:'phone'` |

**Block 1 deliverables:**
1. `POST /api/intake/gravity-rails` — the missing inbound webhook (the one true hole).
2. A normalized intake contract every channel maps onto (patient, codes, payer, channel, source id) so "one door" is a real shared schema, not six parallel paths.
3. Channel honesty: any `ENABLE_REAL_*` flag that's ON must have creds, or be OFF.

---

## Block 2 — The <2-Minute Pipeline + VantaQual

**Goal:** intake → decision-ready in under 2 minutes, on our own qualifications.

**What's real today:** concierge ping center (first-call), brief engine
(multi-pass, self-critique), fact-checker, two-tier readiness routing
(tap-to-approve vs deep-dive), clinician day planner. The pipeline EXISTS.

**VantaQual — productize our own InterQual (decided: library now, RAG later):**
- **V1 (now):** formalize `lib/criteria/library.ts` + `lib/medical-criteria.ts`
  into a branded, versioned **VantaQual** product. Rename the surface,
  stamp `vantaqual_version`, expose a clean `VantaQualResult` (met /
  not_met / partial / insufficient + cited criteria + provenance). It is
  already the criteria basis of every brief — make it a named product, not
  an internal lib.
- **V2 (later, same interface):** Cole's `lib/medical-qualifications/`
  citation-enforced RAG drops in behind the existing `CriteriaSource`
  contract as the deep backend. No caller changes.

**Block 2 deliverables:**
1. `lib/vantaqual/` — formalize the criteria engine under the VantaQual name; `CriteriaSource` stays the seam for the RAG. ✅ **DONE** — `lib/vantaqual/index.ts` (product surface, re-exports the engine, `vantaQualInfo`, `activeBackend()` honestly reports `static_library` until the RAG is wired). 5 tests.
2. A **pipeline timer**: stamp each stage (intake→brief→qual→ready) so "<2 min" is measured, not claimed. Feeds COGS (Block 4) and the load test. 🔜 NEXT.
3. Coverage honesty: VantaQual states which codes it governs vs. falls back on — no silent gaps. ✅ **DONE** — `coverageFor()` returns governed/ungoverned/fully_covered.

---

## Block 3 — The Fork (approved vs denied)

**Goal:** every determination routes somewhere real.

**Today:** `lib/appeal-engine.ts`, `/api/appeals`, and `appeal_of_case_id` /
`appeal_status` / `external_outcomes` (P2P/IRO) fields exist — but the
**journey isn't mapped end to end.**

### Denied → Appeal / IRO journey (needs mapping)
```
determination: deny
  → cued for potential appeal (auto-flag, deadline clock starts)
  → first-level appeal (SAME clinician — continuity, per the engagement)
  → if upheld + escalates → full IRO (separate engagement, separate COGS)
  → outcome recorded (upheld / overturned / modified) → feeds quality + COGS
```
**Deliverable:** map + wire the denial→appeal→IRO state machine with the
deadline clock and the IRO-as-separate-engagement hand-off (ties to Block 4
billing). Document the journey as a real flow, not scattered fields.

### Approved → Downstream care tracking + outcomes
```
determination: approve
  → route to downstream tracking (was the care delivered? outcome?)
  → close the loop: outcome data feeds quality + future criteria tuning
```
**Deliverable:** a downstream-tracking surface (new `care_tracking` table +
status) so an approval isn't the end of the record — outcomes are captured.
This is greenfield; today the record stops at `delivered`.

---

## Block 4 — Billing as a Product (the big real gap)

**Goal:** PE/PM, PM/PM, **or** per-auth — different rate per client — all
tracked, with accurate COGS.

**Today (honest):** billing is **PEPM-only**. `018_invoices.sql` is
literally "Invoices for PEPM billing"; there's a stray
`contracted_rate_per_case` field that invoicing doesn't use. Meow client is
real behind `ENABLE_REAL_MEOW` but unprovisioned. **Multi-model billing
does not exist yet.**

**Block 4 deliverables:**
1. **Billing-model abstraction** — `clients.billing_model ∈ {pepm, pmpm, per_auth}` + a per-client rate config (rates differ per client). Migration + types. ✅ **DONE** — migration `028_billing_models.sql`, pure math in `lib/billing/billing-models.ts:computeInvoiceLine` (14 tests). Per-auth rule wired: denied bills same as approved; appeals billed separately at their own rate; missing rate throws (loud, not silent-zero).
2. **Invoice generation per model** — PEPM (members × rate, exists), PMPM (members × rate), per-auth (count of billable auths in period × rate). One generator, three strategies. 🔜 **NEXT** — `computeInvoiceLine` is ready; wire it into the persistence path in `lib/billing/invoice-generator.ts` (today's generator is PEPM-coupled; leave it working, add the model-aware path).
3. **COGS tracking — human labor first (Jonah's pick):** capture concierge-touch + clinician-review **minutes per auth**, apply a **per-staff loaded rate** (`staff.loaded_cost_per_hour_cents` — varies per hire), roll up **cost per auth** and **margin per client**. ✅ **Foundation DONE** — `case_labor_entries` table (028), `computeLaborCogs` + `computeMargin` (pure, tested, surfaces unpriced entries). 🔜 capture path (pipeline timer + touchpoints → entries) is next.
4. Margin view: revenue (by model) − COGS (labor) per client per period. `computeMargin` ready; UI is later.

---

## Suggested Build Order

| Step | Block | Why first |
|---|---|---|
| 1 | **B4 billing-model abstraction** | Unblocks real client onboarding at any rate type; the current PEPM-only ceiling is a hard limit on who you can sign |
| 2 | **B1 Gravity Rails inbound** | The one true intake hole; closes "one door" |
| 3 | **B2 VantaQual V1** | Productize the criteria engine (mostly formalizing what exists) |
| 4 | **B2 pipeline timer + B4 COGS labor** | Measure <2-min + cost per auth together (same instrumentation) |
| 5 | **B3 denial→appeal→IRO mapping** | Map + wire the fork's hard side |
| 6 | **B3 downstream care tracking** | Close the loop on approvals (greenfield) |
| 7 | **Kill facades + fix 26 stale tests** | So "it works" means it works and CI can guard the cutover |

Steps 1–3 are the highest-leverage "make it real" wins. Each is its own
PR-sized block.

---

## Decisions (Jonah, 2026-06-16)

1. **BPO call center** — ❌ **Do NOT build a dedicated intake path.** Reps use the existing portal/manual form once a BPO partner is selected. Cut from scope.
2. **Per-auth "billable"** — ✅ A **denied auth bills the same as an approved auth.** An **appeal bills separately** (its own billable event). Drives Block 4 invoice logic.
3. **Downstream care data source** — ⏸️ **Undecided.** Block 3 downstream tracking ships as a **capture-ready schema stub only** (table + status fields), no data integration until the source is chosen.
4. **VantaQual naming** — ✅ Working/placeholder name, kept. Lives in one `lib/vantaqual/` surface so a later rename is trivial.
5. **Labor cost rate** — ✅ **Varies per hire.** COGS reads a **per-staff loaded cost rate** (`staff.loaded_cost_per_hour`), not a global constant.

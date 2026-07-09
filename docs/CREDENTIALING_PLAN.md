# Credentialing — Research + Project Plan (Service Line 5)

**Status: NET-NEW BUILD.** Credentialing is not a clinical case — it verifies that a *provider* is who they say they are and meets participation standards. It shares VantaUM's intake + queue + audit chassis and the same "engine assembles, human decides" wall, but none of the clinical brief/review stages. This document is the research and the phased plan; no credentialing code ships until the plan is approved.

---

## 1. What credentialing actually is (and isn't)

**Credentialing** = primary-source verification (PSV) of a provider's qualifications + a committee decision to grant/deny participation. **Re-credentialing** repeats it on a cycle (NCQA: at least every **36 months**). It is distinct from — and usually paired with — **provider enrollment** (getting the provider loaded into a payer's systems and directories) and **privileging** (a facility granting specific clinical privileges). We build credentialing + re-credentialing; enrollment is a possible adjacent line.

**Why it's a separate service line:** different unit (per *provider*, not per auth), different cost center (PSV vendors + committee, no clinical labor), different SLA (weeks, gated by external verification round-trips), different regulatory frame (NCQA / URAC / state / CMS, not medical-necessity criteria).

## 2. The standards that define the work

- **NCQA Credentialing (CR) standards** — the dominant accreditation bar for health plans. Defines which elements must be primary-source verified, the ≤36-month re-credentialing cycle, the credentialing committee requirement, provider rights (to review, correct, be notified), and **delegated credentialing** (a plan can delegate to a CVO/entity under an oversight agreement — this is a sales motion: *be* the delegated CVO).
- **URAC** — alternative accreditation some clients require.
- **CMS** — Medicare/Medicaid participation requirements; Medicare enrollment via PECOS.
- **State law** — many states mandate credentialing turnaround and "clean application" clocks.

Designing to **NCQA CR + delegated-credentialing** is the right target: it's what a payer client will audit us against, and delegated status is the premium product.

## 3. The verification set (what PSV actually touches)

Each element has a source of truth and a round-trip latency — this is why the SLA is weeks, not seconds:

| Element | Primary source | Notes |
|---|---|---|
| Identity + demographics | Provider application / **CAQH ProView** | CAQH is the industry data hub — attest + pull, don't re-key |
| Active licensure | State licensing board(s) | Per-state; some via automated APIs, some scrape/manual |
| DEA / CDS registration | DEA CSOS / state | For prescribers |
| Board certification | **ABMS** / AOA / specialty boards | Certification + expiration |
| Education + training | Medical school, residency, fellowship | Often the slowest — mailed/faxed verifications |
| Work history | Prior affiliations | Gaps > 6 months must be explained (NCQA) |
| Malpractice history + insurance | Carrier + **NPDB** | Coverage limits + claims |
| Sanctions / exclusions | **NPDB, OIG-LEIE, SAM.gov, state Medicaid exclusions** | Ongoing monitoring, not just at credentialing |
| Hospital privileges | Admitting facility | Where applicable |

**Ongoing monitoring** (OIG/SAM/license/NPDB between cycles) is its own recurring product — often sold as continuous credentialing.

## 4. Where the engine helps (and where the wall stands)

Same doctrine as the clinical side — **the engine assembles, the committee decides:**

- **Engine (drafts + verifies):** intake + CAQH pull, OCR of uploaded documents, field extraction/normalization, **orchestrating PSV requests** to each source and reconciling responses, flagging discrepancies (name mismatches, expired licenses, gaps, sanctions hits), assembling the committee-ready file with every element + its source + timestamp, and **continuous monitoring** against exclusion lists.
- **The wall (committee decides):** a credentialing committee (or medical director under NCQA-permitted criteria) renders the participation decision with documented rationale. The engine never grants or denies — it produces a complete, source-verified file and surfaces exceptions. Full attestation + audit trail, identical to the clinical determination path.

This is a clean fit for the existing chassis: intake → queue → assemble → **human gate** → decision → deliver, with PSV orchestration replacing brief generation and the committee replacing the clinical tier.

## 5. Data model (new, minimal)

- `providers` — the credentialed entity (NPI, demographics, CAQH id, specialties).
- `credentialing_cases` — one per credentialing/re-credentialing cycle (provider_id, type initial|recredential, status, cycle due date, committee decision, decided_by, decided_at). Mirrors `cases` structurally so it reuses queue/audit/assignment patterns.
- `verification_items` — one row per PSV element (case_id, element, source, status pending|verified|discrepancy|expired, source_response ref, verified_at). The engine drives these; the committee reads them.
- `monitoring_subscriptions` — continuous OIG/SAM/license watches between cycles.

PHI/PII discipline: provider PII (SSN, DOB) is credentialing PII, stored + logged with the same redaction rules as PHI.

## 6. Phased plan

**Phase 0 — Scope + accreditation target (1 wk).** Confirm NCQA CR + delegated-credentialing as the bar with the first client; decide credentialing-only vs +enrollment vs +continuous monitoring. Lock the verification element list per that client's policy.

**Phase 1 — Data model + intake (2 wks).** `providers`, `credentialing_cases`, `verification_items`, `monitoring_subscriptions` migrations. Provider intake via portal + Partner API (`case_type` extension or a parallel `credentialing` submit endpoint) + CAQH ProView pull adapter. Reuse the queue/audit chassis.

**Phase 2 — PSV orchestration (3–4 wks).** Adapter-per-source (mirror `lib/adapters/*`): CAQH, NPDB, OIG-LEIE, SAM.gov, ABMS, state boards (start with the client's top states), DEA. Each adapter: request → poll/callback → normalize → write `verification_items`. Discrepancy/expiry flagging + the committee-ready file assembler. Sources with no API get a structured manual-task fallback (the same "pend cleanly" discipline).

**Phase 3 — Committee workflow + decision (2 wks).** Committee queue + roster, file review UI, decision capture with rationale + attestation, provider-rights handling (notify/review/correct), decision delivery + payer/directory export. Wall enforced: engine never decides.

**Phase 4 — Continuous monitoring + re-credentialing cadence (2 wks).** `monitoring_subscriptions` cron against exclusion/license sources; auto-open re-credentialing cases at cycle due date; alerts on new sanctions.

**Phase 5 — Delegated-credentialing readiness (1–2 wks).** NCQA delegation oversight artifacts (reporting, audit file, oversight agreement support) so a plan can delegate credentialing to us — the premium motion.

## 7. Build/buy note

PSV can be built (source adapters) or bought (a CVO data aggregator / verification API) and wrapped. **Recommendation: buy the aggregation where a reliable API exists (CAQH, NPDB, OIG/SAM, ABMS), build the orchestration + committee + monitoring + delegated-oversight layer** — that orchestration-and-decision layer is the defensible product and the same "engine assembles, human decides" moat as the clinical side, while re-implementing every state board scraper is undifferentiated cost.

## 8. Throughput + cost shape (feeds the service-line model)

- **Unit:** per provider (initial or re-credential), not per auth.
- **Bottleneck:** PSV round-trip latency (external sources, days) + committee cadence — **not compute**. Size against PSV vendor throughput and committee schedule, not the brief stage.
- **Cost center:** `cc_credentialing` — PSV vendor fees + committee ops. No clinical labor.
- **Price basis:** per provider (initial vs re-credential vs continuous-monitoring subscription tiers).
- **Margin lever:** automation of PSV orchestration + continuous monitoring (recurring revenue) — the same "engine absorbs the manual chase" thesis, applied to verification instead of clinical review.

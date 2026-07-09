# VantaUM Integration Architecture — Connectors + Ambient Learning

**Purpose:** how VantaUM connects to any partner's system — the top EHRs, the core adjudication/claims platforms, the clearinghouses and UM engines — without building a bespoke integration for each. And how every case that flows through makes the engine sharper for that partner specifically.

**The thesis in one line:** we do not build 20 integrations. We built one canonical case contract and translate every external dialect into it over **four transport rails**. New system = a mapping profile, not a new pipeline.

---

## 1. The hub-and-rails model

```
   External systems (top 20)          Rails (4)              The engine (unchanged)
 ┌───────────────────────────┐   ┌──────────────┐
 │ Epic · Cerner · athena ·  │──▶│  fhir_pas    │─┐
 │ MEDITECH · Veradigm · …   │   └──────────────┘ │
 ├───────────────────────────┤   ┌──────────────┐ │   ┌──────────────────────┐
 │ Facets · QNXT · HealthRules│──▶│  x12_278     │─┼──▶│  CanonicalCase       │
 │ Change/Optum · Availity · │   └──────────────┘ │   │  (Partner API shape) │
 │ Zelis · PLEXIS · …        │   ┌──────────────┐ │   │        │             │
 ├───────────────────────────┤   │  rest_json   │─┤   │        ▼             │
 │ GuidingCare · native REST │──▶│ (Partner API)│ │   │  dedup → brief →     │
 ├───────────────────────────┤   └──────────────┘ │   │  assignment → THE    │
 │ Greenway · MEDHOST · VBA ·│   ┌──────────────┐ │   │  WALL → determination│
 │ long-tail claims systems  │──▶│  sftp_batch  │─┘   └──────────┬───────────┘
 └───────────────────────────┘   └──────────────┘                │
                                                                  ▼
                            determination rendered back out over the SAME rail
```

Everything downstream of a rail's `inbound()` is the pipeline we already shipped and verified — dedup, the AI brief, SLA-aware assignment, the human wall, the determination, and the Partner API's signed decision-out webhook. A connector only translates dialect ↔ `CanonicalCase` (`lib/connectors/types.ts`). The wall, the attestation, the audit trail — untouched by which rail a case entered on.

## 2. The four rails (why four is enough)

| Rail | What it is | Who speaks it | Status |
|---|---|---|---|
| **`rest_json`** | Our native Partner API v1 (`docs/PARTNER_API.md`) | Anything that can POST — modern UM platforms (GuidingCare), custom bridges, and our own portals | **Live** |
| **`fhir_pas`** | HL7 **FHIR Da Vinci Prior-Auth Support** (`Claim/$submit` → `ClaimResponse`) | Every major EHR + payer platform — Epic, Oracle Health (Cerner), athenahealth, MEDITECH, Veradigm, NextGen | Rail planned |
| **`x12_278`** | ASC X12N **278** auth request/response (EDI) | Core adjudication + clearinghouses — TriZetto Facets/QNXT, HealthEdge HealthRules, Change Healthcare/Optum, Availity, Zelis, PLEXIS | Rail planned |
| **`sftp_batch`** | Scheduled flat-file / CSV / HL7v2 drops | The long tail — Greenway, MEDHOST, VBA, older TPA claims systems | Rail planned |

The full named registry lives in code (`SYSTEM_REGISTRY` in `lib/connectors/types.ts`) with an honest `verify_status` per system (`live` = tested profile exists; `planned` = rail scoped, profile unproven against that vendor). **No system is claimed as working until a profile is verified against it** — same discipline as the intake contract's acceptance script.

## 3. The Optum case, specifically

Optum is two-sided, and the integration point is **not** an EHR:

- **Care-delivery side** (OptumCare physician groups): largely **Epic**, consolidating from athenahealth/Veradigm legacies → **`fhir_pas`**.
- **Payer/UM side** (where UM capacity is bought): UnitedHealthcare core platforms (UNET, COSMOS) + **TriZetto Facets/QNXT** in segments → **`x12_278`**; and Optum **owns the prior-auth rails** — **Change Healthcare** (clearinghouse, X12 278) and **InterQual** (the criteria our brief engine already cites). Their auth intake flows through provider portals + **InterQual Connect**, not a clinic EHR.

**Two talking points that land with a payer buyer:**
1. **We already speak InterQual.** The brief engine cites InterQual/MCG criteria natively — we're not translating into their criteria language, we start in it.
2. **CMS-0057 tailwind.** The Interoperability and Prior Authorization rule requires impacted payers (UHC included) to stand up **FHIR Da Vinci PAS** prior-auth APIs on a hard deadline. Our `fhir_pas` rail maps onto exactly those shapes — so we're part of their compliance story, not another integration burden. "Point your CMS-0057 PAS endpoint at us" is the whole onboarding for a FHIR partner.

**The two scoping questions for their integration engineer** (these pick the first connector; the hub is done either way):
- Which system *originates* the auth request for this book — provider portal, UNET/Facets workflow, or clearinghouse 278s?
- Can it call REST, or do we need to speak X12 278 / FHIR PAS on day one?

## 4. A connector profile (how a new system onboards)

Binding a tenant + system to a rail is declarative config, reviewable by an integration engineer without a code deploy (`ConnectorProfile` + `MappingProfile` in `lib/connectors/types.ts`):

- `rail` — one of the four.
- `MappingProfile.inbound[]` — dotted source-path → canonical-field maps, with named pure transforms (`icd10_normalize`, `hl7_date`, …). A FHIR `Claim.item.productOrService.coding.code` or an X12 `278 UM01` maps to `procedure_codes` the same declarative way a JSON `cpt[]` does.
- `outbound.decision_map` — how our `approve/deny/partial_approve` renders into the system's disposition codes (FHIR `ClaimResponse.outcome`, X12 278 response `A1/A3/…`).

Onboarding a new EHR that speaks a rail we have = write + verify a mapping profile against their sandbox, then run the acceptance script. No new pipeline, no engine change.

## 5. Ambient learning — the compounding moat

Every case yields a triple: **AI recommended → human decided → downstream outcome** (paid / appealed / overturned / upheld, reported back through the Partner API). Captured per tenant, that triple calibrates the engine to *that payer's book* — their criteria interpretations, their edge cases, their overturn patterns. A competitor starts at zero calibration; switching cost compounds every month of determinations. Types: `lib/learning/types.ts`.

**Three hard rules, enforced by design:**

1. **The wall is untouched.** Learning tunes what the AI *drafts and flags* — extraction emphasis, which criteria to surface. It never tunes, biases, or automates the human decision. The calibration store is readable **only** by the brief generator (`assertAdvisoryOnly` throws otherwise); no determination-writing path can import it. A licensed clinician still decides every case with rationale + attestation.
2. **Tenant-isolated.** A signal learned from client A never touches client B's briefs — every write and read is `client_id`-scoped. Any cross-tenant aggregate would be a separate, explicitly-consented, de-identified product, not this.
3. **PHI-safe provenance.** Learning records hold `case_id` + **coded features only** (procedure/diagnosis codes, criteria ids, decision, outcome) — never names, DOBs, member ids, or narrative. Nothing new about the patient is retained beyond the structured fields already on the case.

Every learned metric surfaces under `estimated_pending_calibration` until a tenant/context crosses `CALIBRATION_MIN_SAMPLE` resolved outcomes — then it graduates to `calibrated`. The `overturn_rate` is deliberately kept as the humility signal: the loop learns where *we* were wrong, not just where the human agreed with us.

## 6. Build order (each stands on what's shipped)

1. ✅ **Canonical case + Partner API v1** (`docs/PARTNER_API.md`) — the hub. Done.
2. **`fhir_pas` rail** — highest leverage: it's the CMS-0057 shape every major payer must expose, so one rail unlocks Epic/Cerner/athena/MEDITECH + PAS-compliant payers. Da Vinci PAS `Claim/$submit` → `CanonicalCase`, determination → `ClaimResponse`.
3. **`x12_278` rail** — unlocks Facets/QNXT/HealthEdge/Change/Availity/Zelis. EDI parse/generate + the same mapping-profile layer.
4. **`sftp_batch` rail** — the long tail; reuses the eFax-style claim-batch worker for scheduled file drops.
5. **Ambient-learning store + calibration reader** — append `LearningRecord`s at brief/determination/outcome, compute `CalibrationSignal`s per tenant/context, wire the advisory read into the brief generator (and nowhere else).

Rails 2–4 each ship with a verification script mirroring `scripts/partner-api-verify.ts` — a connector is not "live" for a system until its profile passes acceptance against that system's sandbox.

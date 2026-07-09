# Standards Rails — FHIR Da Vinci PAS + X12 278 Inbound

**Status: BUILT (inbound).** Two standards-based transport rails now feed the same engine the Partner API v1 feeds. A payer, EHR, or clearinghouse that already speaks FHIR PAS or X12 278 can submit prior-auth requests to VantaUM **without writing any integration code on their side** — they point their existing rail at us.

This is the concrete half of `docs/INTEGRATION_ARCHITECTURE.md`: of the four rails (`rest_json`, `fhir_pas`, `x12_278`, `sftp_batch`), three are now built (`RAIL_STATUS` in `lib/connectors/types.ts`). Per-vendor `verify_status` in `SYSTEM_REGISTRY` stays `planned` until proven against that vendor's actual traffic — the rail being built and a vendor being verified are different claims.

---

## 1. The design: every rail is a dialect, the engine is the language

```
FHIR PAS Bundle ──▶ mapPasBundleToCanonical ──┐
                                              ├──▶ ingestCanonicalCase ──▶ ledger idempotency
X12 278 EDI ──────▶ parse278ToCanonical ──────┘         │                  content dedup
                                                        │                  tenant from KEY
REST JSON ────────▶ Partner API v1 (same contract) ─────┘                  brief queue
                                                                           the wall
```

- **One ingest path** (`lib/partner/ingest.ts:ingestCanonicalCase`): ledger claim FIRST (`intake_submissions` PK — concurrent duplicates structurally impossible), content-fingerprint dedup second, case insert with tenant binding from the partner key (never the payload), `dispatchFinalization` (brief queue when `ENABLE_BRIEF_QUEUE=true`), intake + audit events. Every rail gets identical idempotency, dedup, tenancy, and throughput behavior because it *is* the same code.
- **Rails only translate.** `lib/connectors/fhir-pas.ts` and `lib/connectors/x12-278.ts` are pure functions: external dialect ↔ `CanonicalCase` / determination. No I/O, no policy — fully unit-testable.
- **PHI rule everywhere:** mapping/parse errors carry FHIR element paths or X12 segment locators, **never values**.

## 2. FHIR rail — Da Vinci PAS (R4 subset)

| | |
|---|---|
| Endpoint | `POST /api/connect/fhir/Claim/$submit` |
| Discovery | `GET /api/connect/fhir/metadata` (CapabilityStatement, public) |
| Auth | `X-API-Key` partner key, scope `submit` (same keys as Partner API v1) |
| Request | PAS request Bundle: `Claim` + referenced `Patient`, `Practitioner`/`Organization`, insurer |
| Idempotency | `Claim.identifier[0].value` (retry-stable, 8+ chars after sanitization) |
| Sync response | `ClaimResponse` — `outcome: queued`, review action **A4 (pended)**, `preAuthRef` = our authorization number |
| Errors | `OperationOutcome` with path-only issues (400 mapping, 401/403 auth, 409 content-duplicate) |
| Determination | later, via partner webhook `case.determination` / polling; `renderClaimResponse` maps decisions onto the X12 306 review-action codes PAS reuses: **A1** approved · **A3** denied · **A4** pended · **A6** modified |

The synchronous-pend shape is deliberate and honest: a UM decision with a human wall is never synchronous. PAS explicitly supports the pended flow; the `preAuthRef` we return at intake is the stable reference the final determination carries.

**Replay semantics:** same `Claim.identifier` again → 200 with the *original* case's `preAuthRef`, no second case. Same clinical content under a *different* identifier within 24h → 409 OperationOutcome naming the original case number.

## 3. X12 rail — 278 request/response (005010X217 subset)

| | |
|---|---|
| Endpoint | `POST /api/connect/x12/278` — raw EDI body (`text/plain` / `application/edi-x12`), ≤1 MB |
| Auth | `X-API-Key` partner key, scope `submit` |
| Idempotency | **TRN02** (trace number — the reference EDI senders already treat as retry-stable); BHT03 fallback |
| Sync response | structurally valid 278 response: mirrored envelope (sender/receiver swapped, control number echoed), `BHT*0007*11`, `HCR*A4*<authorization number>` |
| Errors | HTTP 400 JSON with segment/element locators only (formal 999/TA1 generation is the clearinghouse's job at this stage) |
| Determination | `render278Response` with the decided HCR action: **A1** certified · **A3** not certified · **A4** pended · **A6** modified |

**Subset read** (documented in the module header — full SNIP conformance belongs to the clearinghouse, not the engine): ISA/GS/ST envelopes with delimiters derived from the ISA itself; HL 20/21/22/23/EV hierarchy; `NM1` IL/QC patient (+MI member id), 1P/SJ/FA provider (+XX NPI), X3/PR payer; `DMG*D8` DOB; `UM06` level of service (U→urgent, 03→expedited); `HI` ABK/ABF/BK/BF diagnoses (undotted ICD-10 normalized, `M1711`→`M17.11`); `SV1`/`SV2`/`SV3` HC/HP procedures.

**Replay semantics:** retransmitting the same TRN02 → the same pended response with the original authorization number (how EDI senders expect duplicate traces to behave). Same content under a new trace within 24h → pended response pointing at the *original* certification, so a second case is never opened.

## 4. Who this reaches (SYSTEM_REGISTRY)

- `fhir_pas` rail: Epic, Oracle Health (Cerner), MEDITECH, athenahealth, Veradigm, NextGen, eClinicalWorks, PointClickCare — the CMS-0057 mandate means every major payer-facing stack is building toward exactly this shape.
- `x12_278` rail: TriZetto Facets/QNXT, HealthEdge, PLEXIS, EBS/Javelina, Zelis, Availity, Change/Optum — the legacy adjudication + clearinghouse world.
- `rest_json`: everything else that can POST (docs/PARTNER_API.md).
- `sftp_batch`: still `planned` — the long-tail flat-file rail.

## 5. Verification

- `__tests__/lib/connectors/x12-278.test.ts` — tokenizer (ISA-derived + non-default delimiters), full request parse, priority mapping, PHI-free errors, response rendering (HCR actions, envelope swap, SE count, output round-trips through our own tokenizer).
- `__tests__/lib/connectors/fhir-pas.test.ts` — bundle mapping (fullUrl + `Type/id` reference resolution), identifier sanitization, priority mapping, path-only errors, ClaimResponse rendering (A1/A3/A4/A6, preAuthRef, queued vs complete).
- `__tests__/api/connect-rails.test.ts` — both routes end-to-end against the DB stub: key gate + scope, shared-ledger idempotency (`partner:<client>:<ref>`), tenant from the key, dialect-correct responses, idempotent replays return the original auth number, demo-mode short-circuits.

## 6. Onboarding a partner onto a standards rail

1. Issue a key: `npx tsx scripts/issue-partner-key.ts --client <client_id> --name "<Partner>" --scopes submit,read`.
2. FHIR: point their PAS client at `https://app.vantaum.com/api/connect/fhir` (they'll fetch `/metadata`, then POST `Claim/$submit`). X12: their gateway POSTs interchanges to `/api/connect/x12/278`.
3. Determinations flow back over the partner webhook (`docs/PARTNER_API.md §5`) or polling; render into their dialect with `renderClaimResponse` / `render278Response`.
4. Flip the vendor's `verify_status` to `live` in `SYSTEM_REGISTRY` only after real traffic round-trips.

**Known deferred:** outbound *push* of rendered ClaimResponse/278 responses to partner endpoints rides the existing webhook worker (JSON envelope today); rendering the webhook payload natively per-rail is a small follow-up in `lib/partner/webhook-out.ts`. `sftp_batch` rail unbuilt.

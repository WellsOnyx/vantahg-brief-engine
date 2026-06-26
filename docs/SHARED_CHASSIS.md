# The Shared Chassis — UM / Medical Review / IRO / IDR

> **Status: read-only map. No refactor.** This documents where the streams
> *already* converge and branch in the code on `main`, so the three in-flight
> feature branches (`feature/um-channel-agnostic-intake`,
> `feature/medical-review-stream`, `feature/iro-stream`) can merge cleanly.
> It is the shared mental model, not a change.

## The thesis (from STATE.md)

> "Medical Review, IRO, and UM all share one chassis (intake → brief → criteria
> module → reviewer routing → determination → letter → audit) differing only by
> criteria module + reviewer routing + label."

That is literally how the code is built today. There is **one `cases` table**,
**one brief engine**, **one fact-checker**, **one determination/letter path**,
and **one audit log**. The streams are discriminated by two columns and branch
at exactly three seams.

## The discriminators

| Column | Type | Values | File |
|--------|------|--------|------|
| `case_type` | `CaseType` | `'um' \| 'payer_idr' \| 'iro' \| 'ire'` | `lib/types.ts:41` |
| `vertical` | `CaseVertical \| string` | `'medical'`, … | `lib/types.ts` |

`case_type` is the primary stream discriminator. `'um'` covers both UM and
Medical Review (they share criteria + routing, differ only by label/intent);
`'payer_idr'` is the NSA IDR stream; `'iro'`/`'ire'` is the independent-review
stream.

---

## The chassis, stage by stage

```
 intake ──▶ brief ──▶ [criteria module] ──▶ [reviewer routing] ──▶ determination ──▶ letter ──▶ audit
   │          │             │  ▲                    │  ▲                  │  ▲
 CONVERGE  CONVERGE      BRANCH #1             BRANCH #2             BRANCH #3
 (shared)  (param.)    (criteria source)   (who reviews + how)   (template + author)
```

### Stage 1 — Intake  · **CONVERGES**

All streams land in the same `cases` row via the same primitives:

- Auth number — `lib/intake/confirmation.ts:generateAuthorizationNumber`
- Compliance log — `logIntakeEvent` → `intake_log`
- Receipt — `sendReceiptConfirmation`
- Cross-channel dedup — `lib/intake/efax/storage.ts:computeSubmissionFingerprint` + `findDuplicateCase`
- **UM channel-agnostic finalizer** (new, this branch) —
  `lib/intake/finalize-case.ts:finalizeIntakeCase`. Built stream-neutral; it
  loads the case and runs concierge → brief → routing off `case_type`-agnostic
  helpers, so IRO/IDR could call the same finalizer later (see "Merge notes").

Entry points by channel are mapped in `docs/UM_INTAKE_PLAN.md §1`.

### Stage 2 — Brief generation  · **CONVERGES (parameterized)**

One engine, one entry point, internal branch on `case_type`:

- `lib/generate-brief.ts:generateBriefForCase` — `isIdrCase = case_type === 'payer_idr'`
  (line 52) swaps in IDR/NSA factor context (`getIdrFactors()`) vs the medical
  brief. Note at `generate-brief.ts:608`: revision/fact-check IDR branching is
  still partial — a known seam.
- `lib/fact-checker.ts` — `isIdrCase = case_type === 'payer_idr' | 'iro' | 'ire'`
  (line ~624) selects the defensibility lens.
- Persistence is shared: `persistBriefResult` → status `brief_ready`.

### Stage 3 — Criteria module  · **BRANCH #1 (criteria source)**

The 5% human-judgment input differs per stream; the modules are separate files:

| Stream | Criteria module | What it encodes |
|--------|-----------------|------------------|
| UM / Medical Review | `lib/medical-criteria.ts` (`medicalCriteria`, `getCriteriaForCodes`) | Medical necessity; InterQual/MCG client credentials live on `Client` (`uses_interqual`, `uses_mcg`, `*_api_key`) |
| Payer IDR | `lib/idr-criteria.ts` (`idrCriteria`, `getIdrFactors`) | NSA weight-of-evidence factors (QPA, additional circumstances) |
| IRO / IRE | medical criteria + **independence wall** | Same clinical criteria, but reviewer independence is enforced (see Branch #2) |

### Stage 4 — Reviewer routing  · **BRANCH #2 (who reviews + how)**

This is the sharpest divergence — different humans, different routing logic:

| Stream | Router | Mechanism | Notify |
|--------|--------|-----------|--------|
| **UM / Medical Review** | `lib/pod-assignment-engine.ts:assignToPod` + `lib/delivery/lpn-scoring.ts` | SLA-aware LPN → RN → MD nursing tier | `notifyLpnCaseAssigned` / `notifyEscalatedToRn` / `notifyEscalatedToMd` |
| **IRO / IRE** | `lib/assignment-engine.ts:autoAssignReviewer` | Physician assignment **with independence wall** — `ENABLE_IRO_STREAM` gate, excludes the reviewer who touched the original case, keyed off `appeal_of_case_id` (`assignment-engine.ts:49`) | `notifyCaseAssigned` |
| **Payer IDR** | `app/api/cases/[id]/assign-idr-attorney` | Attorney/arbiter assignment (NSA arbitration) | `notifyIdrAttorneyAssigned` |

The UM finalizer routes via `assignToPod` with a physician fallback to
`autoAssignReviewer` — it does **not** itself branch on `case_type`; stream
selection happens by which router a stream's intake path invokes.

### Stage 5 — Determination  · **BRANCH #3 (author + authority)**

| Stream | Authoring surface | Authority |
|--------|-------------------|-----------|
| UM / Medical Review | nursing tier + MD (`rn-review`, `lpn-review`, `physician-feedback`, `cases/[id]` determination) | Clinical medical-necessity judgment |
| Payer IDR | `app/api/cases/[id]/attorney-determination` | Attorney weight-of-evidence (NSA) |
| IRO / IRE | `app/api/cases/[id]/route.ts` determination path, gated `ENABLE_IRO_STREAM` + independence check (`route.ts:167`) | Independent reviewer |

### Stage 6 — Letter  · **CONVERGES (parameterized)**

One template engine, internal branch on `case_type`:

- `lib/determination-templates.ts` — `isIdr = case_type === 'payer_idr'`,
  `isIro = case_type === 'iro' | 'ire'` (lines 113–114) select the template.
  `getTemplateForClient` / `buildDeterminationLetter` / `renderDeterminationLetter`
  are shared.
- Render + delivery shared: `lib/pdf-generator.ts:generateDeterminationPdf`,
  `lib/notifications/determination-delivery.ts:deliverDeterminationLetter`.

### Stage 7 — Audit  · **CONVERGES**

`lib/audit.ts:logAuditEvent` everywhere; HIPAA-safe (no raw PHI). Same trail for
all streams.

---

## Convergence / divergence summary

| Stage | UM | Medical Review | IRO/IRE | Payer IDR | Shared file |
|-------|----|----|----|----|----|
| Intake | ✅ shared | ✅ shared | ✅ shared | ✅ shared | `lib/intake/*` |
| Brief | ✅ | ✅ | ✅ (param) | ✅ (param) | `lib/generate-brief.ts` |
| **Criteria** | medical | medical | medical + wall | **NSA factors** | `medical-criteria.ts` / `idr-criteria.ts` |
| **Routing** | **pod LPN→RN→MD** | **pod** | **MD + independence** | **attorney** | `pod-assignment-engine.ts` / `assignment-engine.ts` |
| **Determination** | clinician | clinician | indep. reviewer | attorney | `cases/[id]/*` routes |
| Letter | ✅ (param) | ✅ (param) | ✅ (param) | ✅ (param) | `determination-templates.ts` |
| Audit | ✅ shared | ✅ shared | ✅ shared | ✅ shared | `audit.ts` |

---

## Merge notes for the three feature branches

Mapping each branch's actual edit surface so they land cleanly. **Verify before
relying on this — branches are moving.**

### `feature/um-channel-agnostic-intake` (this branch)
- **Adds** `lib/intake/finalize-case.ts`, `lib/notifications/concierge-intake.ts` (new files — no conflict).
- **Edits** intake channel routes (`app/api/intake/email`, `app/api/external/submit`, `app/api/cron/efax-process`, `app/api/cases/route.ts`) — gated, additive.
- **Edits** `lib/notifications.ts`: one union member `'concierge_intake_assigned'`.
- **Does NOT touch** `lib/types.ts`, `lib/assignment-engine.ts`, `lib/generate-brief.ts`, `lib/fact-checker.ts`, `lib/determination-templates.ts`, `lib/demo-data.ts` — deliberately, to stay off the IRO/MR surface.

### `feature/iro-stream`
- **Edits** `lib/assignment-engine.ts` (independence wall), `lib/determination-templates.ts` (isIro), `app/api/cases/[id]/route.ts` (IRO determination guard), `lib/demo-data.ts`, `lib/fact-checker.ts`, `lib/types.ts` (CaseType `iro`/`ire`), `app/api/cases/[id]/attorney-determination`, dashboard/UI components, `docs/IRO_STREAM_PLAN.md`.

### `feature/medical-review-stream`
- In its own worktree (`vantahg-medical-review`). Phase-A plan doc so far; expected to touch `medical-criteria.ts` + pod routing labels.

### Conflict hot-spots (watch these)
1. **`lib/notifications.ts` `NotificationType` union** — UM adds
   `'concierge_intake_assigned'`; IDR's `notifyIdrAttorneyAssigned` already
   landed on main. Additions on different lines auto-merge; just don't reflow
   the union.
2. **`lib/types.ts`** — IRO owns `CaseType`/intake edits here. UM intentionally
   does **not** edit it. Medical Review should coordinate before touching it.
3. **`app/api/cases/[id]/route.ts`** — IRO edits the determination path here; UM
   only touches the sibling **list** route `app/api/cases/route.ts` (different
   file) → no overlap.
4. **Routing engines** — UM's finalizer *calls* `assignToPod` / `autoAssignReviewer`
   but edits **neither** engine, so IRO's `assignment-engine.ts` rewrite and
   UM's intake work don't collide.

### Natural post-merge convergence (future, not now)
Once all three land, the cleanest unification is to have **every stream's intake
call `finalizeIntakeCase`**, and let the finalizer pick the router by
`case_type` (pod for `um`, independence-wall MD for `iro`/`ire`, attorney for
`payer_idr`). The finalizer is intentionally shaped to make that a small change
rather than a rewrite. **Do not do this until the branches merge** — it would
create cross-branch conflicts now.

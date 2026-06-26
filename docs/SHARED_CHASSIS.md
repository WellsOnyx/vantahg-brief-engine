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

---

# 🔒 Reviewer Independence — Diagnosis & Central Fix (Phase A)

> **Branch `fix/shared-reviewer-independence` (off `main`). Phase A = diagnosis only, no code changed. STOP for Jonah's review before Phase B.**
>
> Two agents hit the same wall independently: Grok's IRO review let a **conflicted reviewer (`rev-001`) get assigned**, and the Medical Review trace found the appeal **"must be a different reviewer" rule is declared but unenforced**. They are the *same* defect in the shared chassis. Fix it **once, centrally**, so it protects IRO, IRE, appeals, and Medical Review together.

## Where the rule is DECLARED

1. **Appeals (type):** `lib/types.ts:441` — `assigned_reviewer_id: string | null; // must be different from original`.
2. **Appeals (engine docstring):** `lib/appeal-engine.ts:41` — *"ensures a different physician is assigned for the appeal review."*
3. **IRO/IRE (this doc, Stage 4 & 5):** the chassis map asserts an "independence wall" / "independence check" in IRO routing. On `feature/iro-stream` an attempt exists; **on `main` it does not exist at all.**
4. **Regulatory weight:** independence is the legal core of a URAC-accredited IRO and of appeal review (a denier cannot review their own denial). This is the product, not a nicety.

## Why it does NOT actually block (grounded on `main`)

The lineage needed to enforce independence **is captured**, but **no assignment path reads it**:

- **Lineage IS stored.** `createAppeal` sets `cases.appeal_of_case_id = originalCaseId` (`lib/appeal-engine.ts:102`) and `appeals.original_denying_reviewer_id = original.determined_by` (`:122`). The original case also carries `assigned_reviewer_id` and `determined_by`.
- **But the appeal case is created at `status:'intake'` with NO reviewer** (`lib/appeal-engine.ts:74-105`) and then re-enters the **normal** pipeline (brief → `brief_ready` → `assignToPod` → fallback `autoAssignReviewer`). The docstring's promise (line 41) is never executed.
- **`autoAssignReviewer` has zero exclusion.** `lib/assignment-engine.ts:19-128`: fetches active reviewers by `service_category` (`:46-50`), filters by daily capacity (`:66-80`), sorts by turnaround/load (`:92-97`), picks `eligible[0]` (`:99`). Its **only** guard is `status === 'brief_ready' && !assigned_reviewer_id` (`:39`). It never reads `appeal_of_case_id`, `original_denying_reviewer_id`, or the original reviewer. → **The original denier is fully eligible to review the appeal/IRO of their own decision.** This is the `rev-001` assignment.
- **`assignToPod` has zero exclusion either** (`lib/pod-assignment-engine.ts` LPN→RN→MD selection) — relevant because appeals hit `assignToPod` first.
- **Manual assignment is an open bypass.** `PATCH app/api/cases/[id]/route.ts` (~`:166`) writes `assigned_reviewer_id` directly and flips to `md_review` with **no independence check** — so even a correct auto-path can be undone by hand.

**Net:** the rule is real, the data to enforce it exists, and **four independent write paths can each assign a conflicted reviewer.**

## The minimal CENTRAL fix (proposed for Phase B)

One new module, called from every reviewer-assignment chokepoint, **fail-closed**:

- **`lib/reviewer-independence.ts`** (new file — no cross-branch conflict):
  - `getConflictedReviewerIds(caseRow): Promise<Set<string>>` — derive the exclusion set from lineage: follow `appeal_of_case_id` to the original case, collect its `assigned_reviewer_id` + `determined_by`, plus `appeals.original_denying_reviewer_id`. Same derivation serves IRO/IRE and Medical-Review re-reviews. Returns `∅` for first-pass UM (no original → no exclusion → **no behavior change for the ~90% UM path**, protecting the 305-pass baseline).
  - `assertReviewerIndependent(caseRow, reviewerId)` — the **bypass-proof gate**: throws/refuses if `reviewerId ∈ conflicted`. Called at *every write* that sets `assigned_reviewer_id` (auto + manual PATCH), so independence can't be hand-assigned around.
  - `filterIndependentReviewers(caseRow, candidates)` — selection-time filter for the auto pools.
- **Wire-in points (the chokepoints):**
  1. `lib/assignment-engine.ts:autoAssignReviewer` — filter candidates before sort/select.
  2. `lib/pod-assignment-engine.ts` MD/physician selection — same filter for appeal/IRO cases routed via pods.
  3. `PATCH app/api/cases/[id]/route.ts` manual assignment — `assertReviewerIndependent` before the write.
  4. *(future)* `assignToPanel` (Medical Review) — calls the same enforcement (the medical-review branch leaves a marked hook/TODO; we wire it after this merges).
- **Fail-closed behavior:** if exclusion empties the eligible pool, **do not assign** — return `{assigned:false, reason:'no_independent_reviewer'}`, emit an `independence_block` audit event, and leave the case for manual escalation. Never silently assign a conflicted reviewer.

## Every stream that benefits

| Stream | Why independence matters | Enforced today? |
|--------|--------------------------|-----------------|
| **IRO / IRE** | Legal core of URAC IRO accreditation — reviewer must be independent of the original decision | ❌ (the `rev-001` bug) |
| **Appeals** | Regulatory: the denier cannot review their own denial | ❌ (declared, unenforced) |
| **Medical Review panel** | Panel reviewer must not be the original UM reviewer | ❌ (net-new stream; will hook in) |
| **Peer-to-peer** *(candidate)* | P2P reviewer should be independent of the original determination | ❌ (out of scope unless asked) |

## Coordination / merge sequencing

- This fix lands on **`main`** as the single source of truth. **`feature/iro-stream` should DROP its own partial wall** and call the shared enforcement after this merges (removes the broken `rev-001` path).
- `feature/medical-review-stream`'s `assignToPanel` leaves a marked hook; wire to `assertReviewerIndependent` after merge.
- Suggested order: **merge `fix/shared-reviewer-independence` → rebase IRO onto it (drop its wall) → rebase Medical Review (wire the hook).**

## STOP — awaiting review

Diagnosis complete, committed to `fix/shared-reviewer-independence`. **No code changed, `main` untouched.** On Jonah's "go": Phase B implements `lib/reviewer-independence.ts`, wires the four chokepoints, and ships tests that prove a conflicted reviewer is **REFUSED** (raw output), with zero regressions against the baseline.

## ✅ Phase B — IMPLEMENTED (approved 2026-06-26)

Built on `fix/shared-reviewer-independence`. `main` untouched; not pushed/merged; no secrets.

**Shipped:**
- `lib/reviewer-independence.ts` — `getConflictedReviewerIds` (empty for first-pass → no-regression), `filterIndependentReviewers`, `assertReviewerIndependent` (throws `ReviewerIndependenceError`), loader-injected (supabase + demo). Fail-closed.
- Wired chokepoints: `autoAssignReviewer` (`assignment-engine.ts`, live + demo), `assignToPod` (`pod-assignment-engine.ts`, live + demo), manual `PATCH` (`app/api/cases/[id]/route.ts`, returns **409** + `independence_block` audit, before any write). Appeal intake re-entry is covered transitively: an appeal case (`appeal_of_case_id`) flowing into those routers is filtered.

**Scope decision (per the independent-trace refinement) — flagged for the record:**
- **Physician independence is enforced for certain.** Both the direct auto-assign and the pod's `escalate_to_md → autoAssignReviewer` path (`pod-assignment-engine.ts:292`) route through chokepoint #1, so a conflicted physician cannot be assigned by either route.
- **Decision: the original RN/LPN ARE also barred from the appeal's nursing pass.** `getConflictedReviewerIds` includes the original case's `assigned_rn_id` and `assigned_lpn_id` (and `determined_by`, which is the RN on the ~90% nursing-level approvals). `assignToPod` filters conflicted LPNs and **fails closed if the matched pod's RN is the original decider** (rather than silently letting the same nurse re-review). Rationale: complete independence (URAC), and fail-closed routes the case to manual escalation instead of violating it. Trade-off accepted: a single-RN pod cannot auto-handle an appeal of its own RN's decision — by design.

**Test (load-bearing) — `__tests__/lib/reviewer-independence.test.ts`, 13 tests, all green, refusal actually exercised:**
- Core primitives: first-pass = 0 conflicts; appeal = excludes reviewer/decider/RN/LPN/denier; `assert` throws on denier; `filter` removes conflicted + fails closed.
- Path 1 + 3 (autoAssignReviewer / appeal re-entry): refuses rev-001 when sole candidate; picks the independent reviewer when both exist; first-pass still assigns (no regression).
- Path 2 (assignToPod): refuses when the only pod LPN is the original decider; assigns the independent LPN otherwise.
- Path 4 (manual PATCH, live): refuses rev-001 with **409** and **never writes**; lets an independent reviewer through.

**Regression proof:** baseline (Phase B stashed) = 26 failed / 287 passed / 3 todo; with Phase B = 26 failed / **300** passed / 3 todo. Same 9 pre-existing-noise files fail in both → **+13 passing, zero new regressions.**

**Hooks for the other streams:** Medical Review's `assignToPanel` should call `assertReviewerIndependent`; IRO should drop its own partial wall and rely on these chokepoints (merge order: this → IRO → Medical Review).

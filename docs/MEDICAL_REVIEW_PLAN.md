# Medical Review Stream — Phase A Plan

**Status: Phase A (read-only trace + smallest-change proposal). No code changed. Awaiting Jonah's review before Phase B.**

Branch: `feature/medical-review-stream` (isolated git worktree at `~/Developer/vantahg-medical-review`). `main` untouched.

> ⚠️ Collision note up front: a live agent is actively working the **IRO stream** in the shared checkout (`~/Developer/vantahg-brief-engine`, branch `feature/iro-stream`, with `docs/IRO_STREAM_PLAN.md` + uncommitted edits to `lib/types.ts`, `lib/fact-checker.ts`, `lib/determination-templates.ts`, `app/api/cases/[id]/route.ts`, `app/api/cases/[id]/attorney-determination/route.ts`, `lib/assignment-engine.ts`, `lib/demo-data.ts`). To avoid stepping on it I moved this work into a **separate worktree** on its own branch. **Phase B will touch some of the same files (esp. `lib/types.ts` `CaseType`), so the two branches will need deliberate merge sequencing — see §7.**

---

## 1. Context & guardrails

- We are a **service company**; this engine is **internal tooling our own operators use**. Everything runs inside the **live AWS BAA boundary** (Fargate + RDS/Supabase + S3/KMS, per `STATE.md`).
- **The 95% rule holds structurally today and must not change:** the engine does the labor (brief, fact-check, routing, SLA), a **credentialed human renders every determination**. `lib/generate-brief.ts:551` literally instructs the model *"You NEVER render the final determination."* No code path auto-decides a case — determinations are only set by a human via `PATCH /api/cases/[id]` or `submitRnReview`. Medical Review must inherit this exactly.
- Reality check from `STATE.md`: prod Fargate currently boots in **demo mode** (empty Supabase env on the stale container). All logic below has real production paths **and** deterministic demo branches, so this stream can be built and tested without external services.

---

## 2. End-to-end clinical (UM) path — real vs stub vs AWS

Demo gate is central: `lib/demo-mode.ts:30` → `isDemoMode() = !hasSupabaseConfig()`; real Anthropic is a separate opt-in (`lib/env.ts:105` requires `ENABLE_REAL_ANTHROPIC=true` + key).

| # | Step | File(s) | Real vs Stub | Live/AWS wiring |
|---|------|---------|--------------|-----------------|
| 1 | Case creation | `app/api/cases/route.ts:158` (POST), `app/api/cases/batch/route.ts:108` | **Real** — tenant scoping, `VUM-…`/`AUTH-…` numbering, SHA-256 dedup (409), insert `status:'intake'`, **hardcodes `case_type:'um'` at line 284** | Supabase via `getServiceClient()` (`lib/supabase.ts:76`); fires background brief→assign |
| 2 | Brief / medical criteria | `lib/generate-brief.ts:38` `generateBriefForCase`, criteria from `lib/medical-criteria.ts` `getCriteriaForCodes` | **Real** — multi-pass critique loop; hard-throws unless `isRealAnthropicEnabled()` (line 46). Demo → `getDemoBrief()` | **LIVE Anthropic Claude** (`lib/llm/anthropic.ts:15`). Persists + flips `status:'brief_ready'` (`generate-brief.ts:533`) |
| 3 | Fact-check | `lib/fact-checker.ts:550` `factCheckBrief` | **Real, deterministic (no AI by design)** — criteria/code/doc/two-midnight/hallucination guards, 0-100 score + `human_review_recommended` | None (pure local); travels with brief |
| 4 | Concierge validation gate | `app/api/cases/[id]/route.ts:173` (PATCH on `concierge_validation_rationale`); UI `components/ConciergeValidationForm`, queue `app/concierge/review/page.tsx` | **Real but audit-only** — no dedicated columns (`lib/types.ts:145`); a logging gate, **not a hard code-level blocker** | Supabase `audit_log` |
| 5 | Clinical tier LPN→RN→MD | `lib/pod-assignment-engine.ts:37` `assignToPod`; `lib/delivery/lpn-scoring.ts:64` SLA scorer; `submitLpnReview`/`submitRnReview`; `lib/assignment-engine.ts:19` `autoAssignReviewer` | **Real** (each has an `isDemoMode()` stub branch). LPN always → `rn_review`; RN `approve` finalizes (~90%), `escalate_to_md` → `md_review` + `autoAssignReviewer` | Supabase reads/writes; notification adapters |
| 6 | Determination | `app/api/cases/[id]/route.ts:221` (PATCH `determination`) + RN-approve path; letters `lib/determination-templates.ts:108` `buildDeterminationLetter` | **Real** — final determinations auto-call `deliverToClient` → `status:'delivered'`. (IDR `qpa_amount` math is a placeholder, `:162` — not our concern) | Supabase `determination_templates` |
| 7 | PDF | `lib/pdf-generator.ts:24` `generateDeterminationPdf` | **Real** — jsPDF branded letter, no stub | In-process; case read via Supabase |
| 8 | Audit | `lib/audit.ts:16` `logAuditEvent(caseId, action, actor, metadata?, requestContext?)` (+ `logDetermination`, `logDataAccess`, `logSecurityEvent`) | **Real** — PHI auto-redacted (`sanitizeForLogging`), demo → `console.log`, failures swallowed | Supabase `audit_log` |

**Routing after creation** (`app/api/cases/route.ts:319-347`): brief → `persistBriefResult` (`brief_ready`) → **`assignToPod()`** sets `assigned_pod_id/lpn_id/rn_id` + `status:'lpn_review'`; fallback **`autoAssignReviewer()`** sets `assigned_reviewer_id` + `status:'md_review'`. Both gate on `status==='brief_ready'`.

---

## 3. Question (a) — does any "panel reviewer" routing exist?

**No. Panel-reviewer routing is net-new.** What exists today is the internal **LPN/RN/MD nursing tier**. The closest adjacent concepts (reusable scaffolding, not a panel):

- **`Reviewer`** (`lib/types.ts:191`) — internal credentials, `approved_service_categories`, capacity. No panel/external/independent field.
- **IDR external reviewer = a single "IDR attorney"**, not a panel: `assigned_idr_attorney_id` (`lib/types.ts:55`), role `idr-attorney` (`lib/auth-guard.ts:34`), routes `app/api/cases/[id]/assign-idr-attorney` + `…/attorney-determination`. This is the IRO stream's territory (the other agent), and it routes to **one** assignee.
- **Appeal "different reviewer" is declared but NOT enforced:** `lib/types.ts:441` comments `// must be different from original`; `original_denying_reviewer_id` is stored (`lib/appeal-engine.ts:122`) but the appeal re-enters the same `assignToPod`/`autoAssignReviewer` pipeline, which never reads it. `appeals.assigned_reviewer_id` is never written. So conflict-free re-review is intent, not control.

**Implication:** we build panel routing fresh, but we **reuse** the existing `assigned_reviewer_id` field, the `autoAssignReviewer` matching logic, the human-determination PATCH path, and the audit module — so the new surface is small.

---

## 4. Question (b) — smallest change to label + route a "medical review" case to a panel reviewer instead of the internal tier

The minimum viable change, all behind a feature flag, reusing existing machinery:

1. **Type:** add `'medical_review'` to `CaseType` (`lib/types.ts:41`). *(Coordination point — see §7.)*
2. **Intake/label:** stop hardcoding `case_type:'um'` — let an explicit `case_type:'medical_review'` pass through `app/api/cases/route.ts:284`, only when the flag is on (default stays `'um'`).
3. **Route (the actual fork):** in the post-brief callback (`app/api/cases/route.ts:327`), branch:
   `if (flagOn && data.case_type === 'medical_review') → assignToPanel(data.id)` **instead of** `assignToPod(...)`. `assignToPanel` is a thin variant of `autoAssignReviewer` (`lib/assignment-engine.ts:19`) that selects from the panel pool, sets `assigned_reviewer_id`, and sets a status (`'panel_review'`, or reuse `'md_review'` — see §6 decision). The internal LPN/RN/MD path is **never entered** for these cases.
4. **Determination label:** in `lib/determination-templates.ts` `buildDeterminationLetter` (and the PDF title in `lib/pdf-generator.ts`), when `case_type==='medical_review'` render the output **labeled as a Medical Review** (heading/letter-type variant). Human still renders it — unchanged 95% rule.
5. **No auto-decide:** nothing new decides a case; `assignToPanel` only routes. The panel reviewer sets the determination via the existing human PATCH path.

That's the smallest change: **one enum value + one intake passthrough + one routing branch + one label + a flag.** Everything else is reuse.

---

## 5. Smallest "panel pool" option (no migration) vs proper roster (migration)

- **Smallest (recommended for first cut, flag-gated):** treat the existing **MD reviewer pool** as the panel — `assignToPanel` reuses `autoAssignReviewer`'s specialty + capacity match. Zero schema change. Label is what makes it a "medical review / panel" determination.
- **Proper (follow-up):** add `is_panel_reviewer boolean default false` to `reviewers` (one migration, applied to Supabase + RDS per the dual-migration convention in `infra-aws/rds-migrations/`) so the panel is a distinct, credentialed roster. Recommend this as Phase B.1 once the concept is approved, not in the first cut.

---

## 6. Proposed Phase B build (on this branch, flag-gated, no deploy/merge)

1. `lib/types.ts` — add `'medical_review'` to `CaseType`; add optional `case_type` already present on `CaseFormData` (`:475`).
2. `lib/env.ts` — `ENABLE_MEDICAL_REVIEW_STREAM` flag (default **off**), mirroring the `isRealAnthropicEnabled()` pattern.
3. `app/api/cases/route.ts` — flag-gated `case_type` passthrough (replace hardcoded `'um'`); flag-gated routing branch to `assignToPanel`.
4. `lib/assignment-engine.ts` (or a new `lib/panel-assignment-engine.ts` to avoid colliding with the IRO agent's edits) — `assignToPanel(caseId)`: select panel reviewer, set `assigned_reviewer_id` + status, with an `isDemoMode()` branch.
5. New `CaseStatus` value `'panel_review'` **OR** reuse `'md_review'` — **decision needed (§8)**. New value is cleaner for reporting; reuse is smaller and avoids a `case-edit.ts:70` status-list edit.
6. `lib/determination-templates.ts` + `lib/pdf-generator.ts` — medical-review label variant.
7. **Instrumentation via `lib/audit.ts`** (no new infra): emit `medical_review_assigned` (with panel reviewer id), `medical_review_determined` (with **per-case time** = determined_at − assigned_at, in metadata), and `panel_reviewer_override` (when a panel reviewer's determination differs from the brief's recommendation). All PHI-safe metadata only.
8. **Tests (`__tests__/`)** — Vitest, mirroring existing style: flag-off = unchanged `'um'` behavior; flag-on + `medical_review` routes to panel (not pod); label renders; audit events fire with duration + override. Pure-function tests for any scoring; demo-mode shape tests for routes.

**Hard constraints (from the brief):** verify state before acting; commit only to `feature/medical-review-stream`; **do NOT deploy, do NOT merge to main**; do NOT touch `.env`/secrets without showing Jonah first; cite real paths only; never claim a push the tool didn't make.

---

## 7. Merge-sequencing with the IRO stream (avoid the chaos)

Both streams add a value to the **same `CaseType` union** and both touch determination/templates + the cases route. Overlapping files: `lib/types.ts`, `lib/determination-templates.ts`, `app/api/cases/[id]/route.ts`, possibly `lib/assignment-engine.ts`, `lib/demo-data.ts`. To prevent merge chaos:

- I put `assignToPanel` in a **new file** (`lib/panel-assignment-engine.ts`) rather than editing `assignment-engine.ts`, since the IRO agent has that file dirty.
- The one truly shared edit is the `CaseType` union in `lib/types.ts`. Recommend: **merge IRO first, then rebase this branch** (or land both enum values in a single tiny coordinating commit). I'll keep my `types.ts` change to the single union line to make that rebase trivial.
- Suggest Jonah (or whoever merges) sequence: IRO → rebase medical-review → resolve the one-line `CaseType` conflict → merge.

---

## 8. Open decisions for Jonah (need answers before/with Phase B greenlight)

1. **Panel = single reviewer or a true multi-reviewer panel?** §4/§5 assume **one assigned panel reviewer per case** (smallest, mirrors IDR-attorney). If you want N reviewers concurring, that's a bigger schema (panel + votes) — say the word.
2. **New `panel_review` status vs reuse `md_review`?** New = cleaner dashboards/SLA reporting; reuse = smaller diff.
3. **Panel pool now (reuse MD pool) or add the `is_panel_reviewer` roster migration in this branch?** I lean reuse-first, migration as Phase B.1.
4. **Flag name / default** — proposed `ENABLE_MEDICAL_REVIEW_STREAM`, default off. OK?
5. **Does "medical review" map to a `case_type` (my assumption) or to the existing `ReviewType` value `medical_necessity`/`second_level_review` (`lib/types.ts:27`)?** I chose `case_type` because you described it as a distinct *stream* with distinct routing; confirm.

---

## 9. STOP — awaiting review

Phase A is complete and committed to `feature/medical-review-stream`. **No `main` changes, no deploy, no merge.** On your "go" (and the §8 answers), Phase B is a small, flag-gated, fully-tested build per §6.

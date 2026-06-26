# UM Channel-Agnostic Intake — Plan & Current-State Map

> **Branch:** `feature/um-channel-agnostic-intake` (isolated worktree).
> **Scope:** Make UM intake source-agnostic so every channel — eFax, Gravity
> Rail (voice), HIPAA-compliant email, manual portal, and the external API —
> lands in the **same** `cases` object and then runs the **same** downstream
> chassis: notify the concierge for follow-up, generate the clinical brief, and
> push full documentation + routing to the assigned clinician. Mirrors
> `vantaum.com/demo`.
>
> This document is **Phase A (read-only mapping) + the implementation plan**.
> The implementation ships **behind a flag** (`ENABLE_CHANNEL_AGNOSTIC_INTAKE`)
> with tests, so nothing changes for existing channels until the flag flips.

---

## 1. Current intake adapters (as built on `main` @ `8b8ba53`)

Every channel ultimately inserts a row into the `cases` table and stamps
`intake_channel`. They diverge in **how much of the downstream chassis they
run after the insert**. That divergence is the entire problem this work closes.

### 1.1 Channel inventory

| # | Channel | Entry point | Parser / extractor | Queue table | Case insert site |
|---|---------|-------------|--------------------|-------------|------------------|
| 1 | **Manual portal** | `POST /api/cases` (`app/api/cases/route.ts`) | n/a (structured form body) | — | inline |
| 2 | **HIPAA email** | `POST /api/intake/email` (`app/api/intake/email/route.ts`) | `lib/intake/email-parser.ts:parseEmailPayload` | `email_queue` | inline (auto-create if high confidence) |
| 3 | **eFax (generic webhook)** | `POST /api/intake/efax` (`app/api/intake/efax/route.ts`) | — (store-and-200 only) | `efax_queue` | deferred to cron worker |
| 3b | **eFax (Phaxio)** | `POST /api/intake/efax/phaxio` | `lib/intake/efax/providers/phaxio.ts` | `efax_queue` | deferred to cron worker |
| 3c | **eFax cron worker** | `GET/POST /api/cron/efax-process` | `lib/intake/efax/ocr.ts` + `ai-extractor.ts` | reads `efax_queue` | inline (worker) |
| 3d | **eFax CSR triage promote** | `PATCH /api/intake/efax/queue` (`promote`) | reuses worker extraction | `efax_queue` → `cases` | inline |
| 4 | **External / partner API** | `POST /api/external/submit` (`app/api/external/submit/route.ts`) | n/a (structured JSON, HMAC-auth) | — | inline |
| 5 | **Gravity Rail (voice)** | `lib/gravity-rails.ts` + `app/api/gr/*` | — | — | **no case-creation webhook yet** |

### 1.2 Shared intake primitives (already channel-agnostic)

These are already reused across channels and we keep leaning on them:

- **Auth number** — `lib/intake/confirmation.ts:generateAuthorizationNumber()`
  (`AUTH-YYYY-NNNNNN`, sequence-backed in prod, deterministic in demo).
- **Intake compliance log** — `logIntakeEvent()` writes `intake_log` rows
  (channel, hashed patient name, status) for every submission, case-or-not.
- **Receipt confirmation** — `sendReceiptConfirmation()` acknowledges the
  submitter (provider). Currently logs + returns; real fax/email delivery is
  TODO in that helper.
- **Cross-channel dedup** — `lib/intake/efax/storage.ts:computeSubmissionFingerprint()`
  (SHA-256 over normalized patient_name, DOB, member_id, procedure_codes,
  from_number) + `findDuplicateCase()` (24-hour sliding window). Portal, email,
  API, and the eFax worker all dedup against the same fingerprint, so a fax and
  a portal submission for the same patient+procedure collapse to one case.
- **PHI-safe audit** — `lib/audit.ts:logAuditEvent()` on every state change.

### 1.3 The downstream chassis (what should run after every case insert)

The "full" post-intake pipeline, as implemented inline in the **portal** path
(`app/api/cases/route.ts` POST, lines ~311–347):

1. `notifyIntakeConfirmation(...)` — provider receipt.
2. `generateBriefForCase(case, { client })` → `persistBriefResult(...)` —
   AI clinical brief + fact-check, sets status `brief_ready`.
3. `assignToPod(caseId)` — SLA-aware LPN selection (LPN → RN → MD nursing
   tier). On success → `notifyLpnCaseAssigned(...)`.
4. **Fallback** if no pod: `autoAssignReviewer(caseId)` → `notifyCaseAssigned(...)`
   (direct physician).

### 1.4 Coverage gap (the bug this work fixes)

Which channels actually run that chassis today:

| Channel | Case insert | Receipt | **Brief gen** | **Pod assign** | **Clinician notify** | **Concierge notify** |
|---------|:-----------:|:-------:|:-------------:|:--------------:|:--------------------:|:--------------------:|
| Manual portal | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| eFax CSR triage promote | ✅ | ➖ | ✅ | ✅ | ✅ | ❌ |
| **HIPAA email** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **eFax cron worker** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **External API** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Consequence today:** a case that arrives by email, auto-processed eFax, or
> API lands in the queue in status `intake` with **no brief, no pod, no
> clinician** — it silently waits for someone to notice. Only portal-entered and
> manually-promoted faxes get the full treatment. And **no channel notifies a
> concierge per-case** for follow-up, even though concierge follow-up is a core
> part of the service model.

---

## 2. Target design

A single shared finalizer that **every** channel calls after it has inserted
its `cases` row. Source-agnostic by construction: it takes only a `caseId`,
loads the canonical row, and runs the identical chassis.

```
            ┌──────── portal ────────┐
            │   email                │
  channels ─┤   eFax cron worker     ├─→ cases INSERT ─→ finalizeIntakeCase(caseId)
            │   eFax triage promote  │                      │
            │   external API         │                      ├─ notifyConciergeNewIntake   (NEW — follow-up)
            │   Gravity Rail (future)│                      ├─ generateBriefForCase + persist
            └────────────────────────┘                      ├─ assignToPod → notifyLpnCaseAssigned
                                                            └─ fallback autoAssignReviewer → notifyCaseAssigned
```

### 2.1 New modules

- **`lib/intake/finalize-case.ts`**
  - `isChannelAgnosticIntakeEnabled(): boolean` — reads
    `process.env.ENABLE_CHANNEL_AGNOSTIC_INTAKE === 'true'`. Default **off**.
  - `finalizeIntakeCase(caseId, opts?): Promise<FinalizeIntakeResult>` — loads
    the case, runs concierge-notify → brief → pod/reviewer → clinician-notify.
    **Best-effort and non-throwing**: every step is independently guarded so one
    failure can't strand the case or break the caller. Returns a structured
    result (`{ finalized, concierge_notified, brief_generated, pod_assigned,
    reviewer_assigned, reason? }`) for audit + tests. Models the proven portal
    sequence exactly, plus the concierge step.

- **`lib/notifications/concierge-intake.ts`**
  - `notifyConciergeNewIntake(caseId, opts?)` — resolves the concierge assigned
    to the case's client via `client_concierge_assignments` (active row), sends
    a follow-up notification, and audit-logs `concierge_intake_notified`. If the
    case has no client or no active concierge assignment, it audit-logs
    `concierge_intake_unassigned` and returns gracefully (never throws). New
    file (not edits to `lib/notifications.ts`) to keep the diff isolated from
    other streams' notification work.

### 2.2 Wiring (all gated behind the flag)

| File | Change |
|------|--------|
| `app/api/intake/email/route.ts` | after `case_created`, `if (isChannelAgnosticIntakeEnabled()) await finalizeIntakeCase(caseId, { channel: 'email' })` |
| `app/api/external/submit/route.ts` | same, `channel: 'api'` |
| `app/api/cron/efax-process/route.ts` | same in the worker's case-created branch, `channel: 'efax'` |
| `app/api/cases/route.ts` (portal) | already runs brief/pod inline; behind the flag, **also** fire `notifyConciergeNewIntake` so portal gains the concierge follow-up. Brief/pod left as-is to avoid double-generation. |

> Convergence of portal + triage-promote onto `finalizeIntakeCase` itself (so
> there's literally one chassis implementation) is a clean follow-up once the
> flag has proven out in prod. We deliberately **do not** rewire those two
> already-working paths in this change to keep blast radius minimal.

### 2.3 Flag semantics

- **`ENABLE_CHANNEL_AGNOSTIC_INTAKE` unset / `false`** → byte-for-byte current
  behavior. Email/eFax-worker/API create the case + receipt and stop; portal
  unchanged.
- **`= true`** → every channel runs the identical downstream chassis; every
  channel notifies a concierge for follow-up.

### 2.4 Demo-mode interaction

The email/eFax/API routes already short-circuit to demo responses **before**
real case creation when `isDemoMode()` is true, so `finalizeIntakeCase` only
ever runs in real mode. `generateBriefForCase` self-gates on
`isRealAnthropicEnabled()`; the finalizer catches that and records
`brief_generated: false` with a reason rather than throwing — a reviewer can
regenerate later. This matches the portal's existing background-failure
handling.

---

## 3. Test plan (`__tests__/lib/intake/finalize-case.test.ts`)

Pure-function + mocked-dependency coverage (no DB, no network), matching the
existing intake test conventions (`vi.mock`, `vi.stubEnv`, dynamic import after
`resetModules`):

1. `isChannelAgnosticIntakeEnabled()` reflects the env flag (off by default).
2. `finalizeIntakeCase` happy path: concierge notified, brief generated +
   persisted, pod assigned, LPN clinician notified — result flags all true.
3. Pod-unavailable path: falls back to `autoAssignReviewer` + `notifyCaseAssigned`,
   `reviewer_assigned: true`, `pod_assigned: false`.
4. Brief-generation failure (no real Anthropic) is swallowed:
   `brief_generated: false` + reason, **case is not stranded**, function still
   returns (does not throw).
5. Case-not-found → `finalized: false` with a reason, no downstream calls.
6. Concierge resolution: with an active `client_concierge_assignments` row the
   concierge is notified; with none, `concierge_intake_unassigned` is audited
   and the rest of the chassis still runs.
7. Channel wiring: with the flag **off**, the email route does **not** call the
   finalizer (regression guard for the gate).

---

## 4. Out of scope (flagged for other branches / future work)

- **Gravity Rail case-creation webhook.** The GR client + chat endpoints exist
  (`lib/gravity-rails.ts`, `app/api/gr/*`) but there is no inbound
  voice-intake → case webhook yet. When the GR team ships their voice workflow,
  add `POST /api/intake/voice` (or `/api/gr/webhook`) that normalizes the GR
  payload and calls the **same** `finalizeIntakeCase`. The finalizer is built to
  make that a thin adapter. Tracked in `ROADMAP.md` ("Gravity Rail webhook
  live").
- **Real receipt delivery.** `sendReceiptConfirmation` still logs rather than
  sending a real fax/email (its own TODO). Independent of this work.
- **Cross-stream chassis convergence.** See `docs/SHARED_CHASSIS.md` — UM,
  Medical Review, and IRO share this exact chassis and differ only by criteria
  module + reviewer routing + label. This plan keeps UM's intake clean so that
  convergence stays mergeable.

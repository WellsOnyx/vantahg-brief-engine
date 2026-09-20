# Internal IDR review workflow (HG lane)

Internal-only. This is the merge-safe IDR Ops assist contract on `main`.
It does **not** ship portal automation, a bookmarklet, or a serve process.

Older open PRs ([#44](https://github.com/WellsOnyx/vantahg-brief-engine/pull/44) mirror/bookmarklet, [#46](https://github.com/WellsOnyx/vantahg-brief-engine/pull/46) training dataset) are **stale** (wrong base, migration clash with case-spine `027`). Do not merge them blindly. Port further engine pieces only after these guards stay green.

## Doctrine (locked)

| Rule | Meaning |
|------|---------|
| **Human signs** | The assist prepares a draft. A credentialed arbiter / attorney / MD signs the determination. Nothing here is a final decision. |
| **Never submit** | Assist code must not click Save/Submit/Next/Finalize/Attest, must not call `form.submit()`, and must not dispatch a submit event. The return type of every assist plan pins `submitted: false`. |
| **DRAFT stamp** | Every reviewer-facing artifact is stamped `DRAFT FOR ARBITER REVIEW — INTERNAL WORK PRODUCT, NOT FOR DISTRIBUTION`. Unstamped output is refused. |
| **Human-only fields** | DLI number and attestation name/date stay blank. The reviewer types them from the portal screen. |
| **Private bind** | If an internal serve process is added later, it may bind only to loopback or RFC1918. `0.0.0.0` / `::` / public IPs are refused. |
| **No live credentials** | No portal passwords, no CMS keys, no `.env` secrets in this module. Tests use synthetic strings only. |
| **No Optum outreach** | Optum / Kari Cook stays frozen until Jonah explicitly opens that thread. |
| **No tooling fingerprints outbound** | Portal rationale paste and shared Cases Log notes must not contain engine/bookmarklet language or `UPPER_SNAKE` flag tokens (`HEURISTIC_MODE`, etc.). |

## What lives on `main` today

- **Payer IDR case spine** (already shipped): `idr-attorney` role, `case_type = 'payer_idr'`, attorney queue + human determination. That path already requires a human to write the determination.
- **This module:** [`lib/idr-assist/guards.ts`](../../lib/idr-assist/guards.ts) — never-submit, DRAFT stamp, private-bind, human-only fields, external-surface cleanliness. Tests in [`__tests__/lib/idr-assist/guards.test.ts`](../../__tests__/lib/idr-assist/guards.test.ts).

## Reviewer loop (when assist artifacts exist)

1. Open the DRAFT-stamped mirror / answer sheet on a private workstation.
2. Read flags and confidence as triage, not as a decision.
3. Transcribe into the submission portal **by hand**, or (later) use a fill helper that is gated by `filterAssistActions` / `assertNeverSubmitSource`.
4. Type DLI and attestation yourself.
5. Review every field.
6. The human clicks Save / Submit. The machine never does.

## Adding more assist code later

Import the guards; do not re-implement them.

```ts
import {
  applyDraftStamp,
  assertDraftStamped,
  assertExternalSurfaceClean,
  assertNeverSubmitSource,
  assertPrivateBind,
  filterAssistActions,
} from '@/lib/idr-assist';
```

- Stamp every HTML/markdown artifact with `applyDraftStamp` and `assertDraftStamped`.
- Run intended field actions through `filterAssistActions` before any DOM write.
- Run `assertNeverSubmitSource` on any JS you emit to a browser.
- Call `assertPrivateBind(host)` before `server.listen`.
- Run `assertExternalSurfaceClean` on anything that might be pasted into the portal or the shared billing sheet.

Do not add: CMS/portal submit bots, live credential loaders, Optum contact flows, or public bind defaults.

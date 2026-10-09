# 15 — IRO Panel & Credentialing

**Status:** Initial portal module. Synthetic data only. No live PHI.
**Line:** VantaHG = IRO + IDR. This module is the IRO panel and credentialing workspace.
**Does not change:** UM Med Review pricing, `lib/billing/um-price-card.ts`, billing statements, or `lib/entitlements/um-brief-engine.ts`.

A VantaUM med-review contract does not open this module. An IRO line contract does not grant free UM Brief Engine.

## Gates

| Gate | Where | Effect |
|------|--------|--------|
| Feature flag | `ENABLE_IRO_PANEL=true` | Module routes return `404 iro_panel_disabled` when off |
| Entitlement | `IRO_LINE_CONTRACT=true` or `iro_module_settings.iro_line_contract` | Otherwise `403 missing_iro_line_contract` |
| Cutover | `iro_module_settings.cutover_gate` | Stays `closed` until the checklist below is confirmed. The workspace can be tested before the gate opens |

## What ships at initial portal launch

- Roles `credentialing_admin` and `clinical_approver`, assignable from Team. The Medical Director seat is empty until someone is appointed.
- HR workspace `/iro/credentialing` for pipeline, licenses, primary-source verification, board certification, stored sanctions results, clinical experience, agreements, outstanding items, findings, follow-ups, corrective actions, and reminders.
- Clinical approval queue `/iro/approval`. Thelma can finish verification. Only `clinical_approver` can move a file to approved, conditional, or denied.
- Front-line assignment view `/iro/panel` and `GET /api/iro/panel`.
- Per-case conflict and qualification attestations. Assignment and completion stay blocked until both pass. Panel approval does not count as the attestation.
- Only approved or conditional physicians who are unexpired, available, and eligible for the case specialty and state can be assigned.
- Reminder job `GET /api/cron/iro-reminders` (Vercel schedule `0 7 * * *`). It writes dashboard rows. It does not send email.
- Evidence through the existing storage adapter, logical bucket `iro-credentialing` (private, KMS, block-public, 5-minute signed URLs). Demo mode returns a non-network signed URL.
- Audit events for status changes, decisions, evidence, attestations, blocked assignment, reminders, and cutover.
- Workbook import tooling and the reconciliation checklist. Running Thelma's real file is an operator step, not something this launch executes.

## What follows launch

- Transfer of the interim workbook and restricted evidence folders, then opening the cutover gate. Tooling is in the repo; the cutover itself waits until the workspace is tested, transferred records are checked, and access is confirmed.
- Medical Director workflow finalization after `clinical_approver` is appointed. The role and the two-step machine exist now.
- Live OIG LEIE, SAM, and NPDB calls. The launch stores results and dates through a stub adapter (`live_call: false`). No outbound screening HTTP.
- EventBridge twin of the reminder cron (Vercel cron is wired; the AWS cron stack today only invokes eFax).
- Accreditation-specific evidence packs once Sam and Johana confirm which rules apply.

## Roles and permissions

`credentialing_admin` and `clinical_approver` are not internal UM staff. They do not inherit eFax triage or the client roster.

| Capability | credentialing_admin | clinical_approver | Front-line (reviewer, concierge, delivery-lead, practice-lead) | admin |
|------------|---------------------|-------------------|------------------------------------------------------------------|-------|
| HR workspace, contracts, evidence, findings | yes | no | no | yes (operator) |
| Verification packet (licenses, PSV, sanctions, experience). No contracts | yes | yes | no | read |
| Sign approved / conditional / denied | no | yes | no | no |
| Assignment card (name, specialty, jurisdiction, availability, assignment status, case-check completion) | yes, same stripped card | yes, same stripped card | yes | yes, same stripped card |
| Record case attestation | no | no | reviewer only | yes (operator) |
| Assign a physician to an IRO case | no | no | yes | yes |
| Complete an IRO case | no | no | reviewer | yes |

Server enforcement is on every route and in the repository query for the assignment view (`iro_panel_assignment_v` plus `ASSIGNMENT_SELECT_COLUMNS`). A reviewer who calls an HR route gets 403. The panel response is built from an allowlist, so an admin calling `GET /api/iro/panel` still does not receive license numbers, contracts, or findings.

RLS policies match that split for non-bypass database roles. The app's service role bypasses RLS, which is the existing platform pattern, so the API projection is the control that production traffic hits.

## Status machine

| Status | Who moves it forward | Next |
|--------|----------------------|------|
| applicant | credentialing_admin | in_verification |
| in_verification | credentialing_admin, and only when the verification packet has no gaps | pending_clinical_approval |
| pending_clinical_approval | clinical_approver | approved, conditional, or denied |
| approved / conditional | credentialing_admin or clinical_approver | suspended |
| approved / conditional | system (expiry) | expired |
| suspended / expired | credentialing_admin | in_verification |
| denied | credentialing_admin | applicant (reopen) |

Verification gaps that block the handoff to the Medical Director: a license with number, expiry, and primary-source result; OIG LEIE and SAM rows with a date and result; board certification or a documented waiver; direct patient care that is current or ended within 24 months; acknowledged confidentiality, conflict-policy, and panel-participation agreements; no unresolved outstanding items.

## Data model

Migration `033_iro_panel_credentialing.sql` (same file under `supabase/migrations/` and `infra-aws/rds-migrations/`).

- `iro_module_settings` — entitlement mirror and cutover checklist
- `iro_physicians` — pipeline row. HR columns (`legal_name`, `contract_ref`, `notes_hr`, …) are not on the assignment view
- `iro_licenses`, `iro_board_certifications`, `iro_sanctions_screenings`, `iro_clinical_experience`, `iro_agreements`, `iro_outstanding_items`
- `iro_credential_events` — append-only (update and delete raise)
- `iro_evidence` — storage path metadata. Bytes live in the `iro-credentialing` bucket
- `iro_case_reviews` — specialty and state required for an IRO case. `case_ref` is the spine case id when one exists. This table does not write billable events
- `iro_case_attestations` — one immutable row per case and physician. The assignment view `iro_case_check_status_v` exposes only the boolean
- `iro_reminders` — open items for the HR dashboard
- `iro_panel_assignment_v` — name, specialties, jurisdictions, availability, assignment status, limited to current approved or conditional physicians

## Case checks

Panel approval means the physician may be on the panel. It does not clear a specific case.

Before assignment or completion:

1. Status is approved or conditional, not expired, not suspended, availability is not unavailable.
2. Specialty and jurisdiction match the case.
3. The reviewer has attested no conflict (`conflict_free`) and a specialty and jurisdiction match.

A stored conflict note is kept with the attestation and is not returned on the assignment API.

## Workbook migration

Template: `fixtures/iro/credentialing-workbook.template.csv` (CSV or a single-sheet `.xlsx` with the same headers).

```bash
npm run import:iro-credentialing -- --file fixtures/iro/credentialing-workbook.template.csv
npm run import:iro-credentialing -- --file workbook.xlsx --report /tmp/iro-import.json
ENABLE_IRO_PANEL=true IRO_LINE_CONTRACT=true npm run import:iro-credentialing -- --file workbook.csv --apply
```

Dry-run is the default. The report lists valid physicians, errors, and warnings. A column named `ssn`, `dob`, `date_of_birth`, `member_id`, or `patient_name` rejects the file. `--apply` upserts by `physician_key` and does not open the cutover gate.

Additional license rows repeat `physician_key`. Lists use `|`.

### Reconciliation checklist

The script prints this. Leave the gate closed until each item is true:

- Workspace tested on synthetic data
- Transferred records checked (row counts, licenses, screening rows)
- Evidence links or restricted-folder paths accounted for
- Access confirmed: HR sees the full record, the Medical Director signs without contracts, front-line sees only the assignment card
- `clinical_approver` assigned only after the Medical Director is appointed
- Cutover opened only when `workspace_tested`, `transferred_records_checked`, and `access_permissions_confirmed` are all true

`POST /api/iro/credentialing/cutover` with `{ "open": true, ...checks }` records the decision and writes an audit event. A partial checklist stays closed.

## Open items for Sam and Johana

These are not assumed by the build:

1. Which accreditation and state IRO rules apply (URAC, a state external-review statute, or both), and which evidence each one requires.
2. Whether NPDB is required in addition to OIG LEIE and SAM. The table can store an NPDB row. The launch does not query it.
3. Recredentialing interval. The approval default is 24 months when the signer does not pass `expires_on`. Confirm or replace that.
4. Whether a conditional approval may be assigned to cases. The launch treats conditional like approved for eligibility and shows it only as assignment standing, not as HR terms.
5. Who besides Thelma may hold `credentialing_admin`, and who names the Medical Director into `clinical_approver`.
6. How long credentialing evidence must be retained, and whether the restricted evidence folders move object-for-object into `iro-credentialing` or stay linked.
7. Whether front-line assignment should include concierge and delivery-lead (included now) or only the reviewer who attests (the attestation itself is reviewer-only).

## Out of scope

- Live PHI, live screening APIs, and live payer calls
- UM price card, platform fee, review fee, gold-card, or packaging copy
- Using this module as a back door into UM Med Review

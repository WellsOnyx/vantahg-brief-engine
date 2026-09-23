# 02 — Client onboarding framework

Onboarding is a **sellable checklist** first, software second. Every step produces an artifact in SoR or Drive (contracts) with an owner and a date.

**Cole operator path (Phase 7.1):** [`11-cole-onboarding-runbook.md`](11-cole-onboarding-runbook.md) + `/admin/onboarding`. Use that to run A→E. This file stays the framework lock.

## Phase A — Commercial & legal (before any PHI)

| Step | Owner | Artifact | Gate |
|------|-------|----------|------|
| A1 MSA + fee schedule | Jonah / commercial | Signed MSA | Required |
| A2 BAA (covered entity ↔ Vanta) | Legal | Executed BAA | **Hard gate** for live PHI |
| A3 Subprocessor BAAs | Ops | Anthropic (if clinical), fax, e-sign, hosting as applicable | Hard gate |
| A4 Security questionnaire / SOC if required | Cole / ops | Completed pack | Client-dependent |
| A5 Invoice entity + billing contact | Finance | Stripe/QB customer id | Required |

### Fee schedule (minimum fields)

**VantaUM sells Med Review** (paid wedge). Do not invent a second price list here. Two-line card: [`um-unit-economics-rate-card.md`](um-unit-economics-rate-card.md) (platform membership + clinical review; rules/auto review is $0). Handoff: [`um-pricing-rules.md`](um-pricing-rules.md). Do not sell UM as a standalone SKU. Do not include free UM with a third-party review shop. **VantaHG = IRO + IDR only.** Do not tell a buyer the platform fee is $0 under Med Review; that point is an open question on the rate card.

- Vanta med-review contract under **UM** (paid wedge)
- UM Brief Engine included free **only** when `vanta_med_review_contract` is true and `med_review_provider=vanta`
- Per-auth / first-level-appeal / rush lines are **usage tracking** under that contract, not a standalone UM offer
- Pass-through (IRO filing fees if ever bundled — N/A until locked; HG lane)

## Phase B — Client configuration (SoR)

Store as `client_config` (versioned). Required fields:

```text
client_id
legal_name
lob[]                    # lines of business covered
sla_hours_standard
sla_hours_urgent
auto_vs_md_policy        # go-live: always_md
notify_channels[]        # portal | webhook | fax | email(secure)
determination_recipients # roles / endpoints
cm_handoff_enabled
cm_webhook_url?          # if enabled
intake_modes[]            # gravity_rail | api | sftp | fax
timezone
business_hours
escalation_contacts[]    # name, role, phone/email (business contact; minimize PHI)
cx_owner                 # internal MX Delivery Lead / CX bot id
reviewer_queue           # med review team
vanta_med_review_contract # required true for free UM Brief Engine
med_review_provider      # vanta | third_party | none  (third_party never gets free UM)
```

**Config change control:** every change creates a new version + audit event; CX confirms with client in writing for SLA or route changes.

## Phase C — Access

| Role | Sees | Auth |
|------|------|------|
| Client admin | Users, config summary, invoices, reports | Cognito (post-cutover) |
| Client user | Their cases, downloads, limited reports | Cognito |
| CX | Account health, stuck cases, commitments (non-PHI notes) | Internal |
| Med review / MD | Queue, briefs, packets, sign | Internal + MFA |
| Superadmin | All | Break-glass + audit |

Checklist:

- [ ] Client admin invited
- [ ] MFA enforced for clinical roles
- [ ] Least-privilege roles assigned
- [ ] Test login on staging

## Phase D — Connectivity

Pick **one** primary intake for go-live; add secondary after stable.

| Mode | Setup | Acceptance |
|------|-------|------------|
| Gravity Rail | Keys + HMAC + callback URLs | Synthetic case appears in queue < 2 min |
| External API | `POST /api/external/submit` key + optional HMAC | Same |
| Fax (eFax/Phaxio) | Number + webhook HMAC | Synthetic fax → case |
| SFTP | Folder + PGP if required | File drop → case |

Staging only until Phase E.

## Phase E — Go-live gates

| Gate | Count | Rule |
|------|-------|------|
| E1 Synthetic | ≥ 10 | Happy path + 2 failure paths (missing clinicals, gray zone) |
| E2 Shadow | ≥ 10 | Live-shaped packets; MD signs; **no** outbound to member/provider as final |
| E3 Live | First N (agree N with client, default 25) | Full fan-out; MD on every determination; daily standup with CX |

**Rollback:** if SLA miss rate > agreed threshold in first 25, pause live intake, stay on shadow, root-cause.

## Onboarding runbook (CX script)

Day 0: kickoff — confirm LOBs, SLAs, intake mode, determination channels.  
Day 1–2: config + users + connectivity in staging.  
Day 3–4: synthetic pack run with client watching portal.  
Day 5–7: shadow.  
Day 8+: live with hypercare (CX daily until first 25 clear).

## Artifacts folder (per client)

```text
clients/{client_id}/
  msa.pdf / baa.pdf
  config/vN.json
  connectivity.md
  go-live-log.md
  hypercare-notes.md   # non-PHI
```

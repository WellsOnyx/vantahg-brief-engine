# VantaUM — Roadmap & Source of Truth

**Audit date:** 2026-05-18 (Monday)
**Author:** Claude (this thread, post-multi-thread reconciliation)
**Status:** Replaces conflicting STATE.md sections. This document is the source of truth until explicitly retired.

---

## TL;DR — Where We Actually Are (Ground-Truth Verified)

| System | Status | Reality |
|---|---|---|
| AWS infrastructure | 🟢 Healthy | ALB, RDS, S3, Cognito, EventBridge all live |
| RDS schema | 🟢 Current | 26 tables, migrations 019/020 applied |
| RDS data | 🔴 Empty | 0 signups, 0 concierges, 0 delivery_leads |
| Running container | 🔴 STALE | v2 from 2026-05-12; ~6 days of code never deployed |
| Secrets vault | 🔴 13/17 empty | All Supabase keys empty, HelloSign empty, Phaxio empty |
| SES | 🔴 Pending | Identity created, DKIM not validated in DNS, sandbox |
| Auth bypass fix | 🔴 Unmerged | Lives only on `claude/backup-auth-bypass-and-migrations-20260518` |
| Branch state | 🔴 Diverged | `main`, `origin/main`, `mvp-production-ready` all different histories |
| Tests | 🟢 Passing | 212/212 on backup branch |
| Marketing site | 🟢 Live | vantaum.com on Vercel |
| App URL | 🟡 Live but demo-mode | app.vantaum.com returns 200, `database":"demo_mode"` |

**Single biggest issue:** The "AWS cutover complete" commit (`c82f056`) was structurally true (URL works) but functionally false (container runs old code, secrets empty, demo mode active). Six days of "shipped" features are invisible to customers.

**Readiness for real TPA onboarding: ~15%.** Same as Thread 1's honest audit. Will reach ~95% by Wednesday EOD if this roadmap executes cleanly.

---

## Wednesday Gate — Definition of Done

A real prospect (Kaylee at Valens, or any test signup) can complete this entire flow on `app.vantaum.com` without intervention:

1. Visit `/signup-tpa`, fill form, submission writes a **real row** to RDS
2. Admin sees the row at `/admin/signups`, generates MSA+BAA with TPA info auto-populated, Florida governance, Jonathan Arias as VantaUM signer
3. Admin clicks Send for Signature — Dropbox Sign sends a **real email** to the TPA
4. TPA signs in email; webhook fires; magic link email sent
5. TPA clicks magic link → lands on `/portal/tpa` (200, not 404)
6. TPA invites a provider user from their portal — provider receives magic link
7. Provider clicks magic link → lands on `/portal/provider` scoped to their practice
8. Either portal submits a real case via the upload form — case lands in RDS, brief generates, audit logged
9. **Case ingestion via multiple channels works:** concierge manual intake form, provider portal manual submit, eFax (already built). Each case attributes to TPA + physician office + covered life + assigned concierge.
10. Auto-assign hook fires on signup approval — concierge gets assigned based on capacity (300/week cap enforced)
11. Admin sees the case in queue; assigned concierge sees it on their dashboard
12. Auth bypass closed — `/admin/*` requires real authentication in production

### Explicitly NOT in Wednesday scope
- Meow billing live (paused on new VantaUM Meow account creation — Jonah-side)
- SES production access (24-48h AWS ticket — file Monday, accept the wait)
- Gravity Rail voice channel (GR team owns the voice workflow; webhook to VantaUM is post-Wed)
- Email channel ingestion (mailbox poll → case create — post-Wed)
- TPA system connectors (Javelina/Eldorado/FHIR/EDI — separate workstream, days not hours)
- RingCentral concierge phone/email/fax auto-provisioning (parked on Maria Medrano confirming plan tier)
- Cognito auth cutover (hybrid Supabase Auth stays for V1)
- VantaMD provider-side brief engine (Phase 2 product)
- IDR/IRO arm (Phase 3 product)

---

## Branch Reality

```
origin/main                 6d9ff81  Phone-session sweep (PR #25)  ← current canonical
  ├─ contains: portals, practices, calendar invite, PDF upload, quality dashboard
  └─ MISSING: auth bypass fix, ACH→BANK_TRANSFER fix, honest audit STATE.md

origin/claude/backup-auth-bypass-and-migrations-20260518
  ├─ e1615ed  Auth bypass closed + RDS migrations 019/020 applied
  └─ 2b72bf2  ACH fix + honest audit
  └─ Based on b9feb8c (older main) — needs rebase onto current origin/main

origin/claude/backup-wip-approve-route-20260518
  └─ 0af11e4  Uncommitted approve route changes from mvp-production-ready
  └─ Backup only. Validate before using.

local mvp-production-ready  b5f0056  ← stale, diverged history, do not use
local main                  b9feb8c  ← stale, 6 commits behind origin
```

**Resolution plan:**
1. Treat `origin/main` (`6d9ff81`) as the canonical base
2. Cherry-pick `2b72bf2` (ACH fix + audit) onto fresh branch off origin/main
3. Cherry-pick `e1615ed` (auth bypass + migrations) onto same branch
4. Resolve any conflicts (likely zero — Thread 1 worked carefully)
5. Validate tests pass (212/212 expected)
6. Open PR to merge into `main`
7. Delete the stale `mvp-production-ready` branch after confirming nothing valuable on it that isn't already on `origin/main`

---

## Five-Phase Execution Plan

### Phase 0 — Reconciliation & Backup (Monday, 30 min)
**Owner:** Claude  
**Status:** IN PROGRESS

- [x] Back up unpushed work to origin as `claude/backup-*` branches
- [x] Run ground-truth audit (prod URLs, ECR, ECS, secrets vault, SES, RDS schema)
- [x] Write this ROADMAP.md
- [ ] Push ROADMAP.md to a backup branch on origin (so it survives compaction)
- [ ] Reconcile branches: cherry-pick backup commits onto fresh branch off origin/main
- [ ] Open PR for reconciliation; merge to main

### Phase 1 — Wire AWS to Serve Current Code (Monday, 2-3h)
**Owner:** Claude + Jonah (Jonah owns secrets vault)

**Sequenced steps:**
1. **CDK change:** Add `ENABLE_AWS_DB=true` to `infra-aws/lib/compute-stack.ts` env block. Re-deploy compute-stack. _(Claude, 20 min)_
2. **Jonah fills secrets vault** (`vantaum-prod-third-party-keys` in AWS Console):
   - `supabase_url`, `supabase_anon_key`, `supabase_service_role_key` ← from Vercel env
   - `hellosign_api_key`, `hellosign_client_id` ← from app.hellosign.com → API Settings
   - `phaxio_api_key`, `phaxio_api_secret`, `phaxio_callback_token` ← from Phaxio dashboard (or `""` if not yet)
   - `google_vision_api_key` ← from Vercel
   - `sentry_dsn` ← from Vercel (or `""`)
   - `gravity_rail_api_key` ← from Vercel (or `""`)
   - **Time: 15 min, Jonah-side**
3. **Build current container** off reconciled `main` (Phase 0 result). `docker build --platform linux/arm64`. _(Claude, 15 min)_
4. **Push to ECR** as `vantaum-prod-app:v3`. _(Claude, 5 min)_
5. **Deploy compute-stack with v3 tag.** `REAL_IMAGE_TAG=v3 cdk deploy vantaum-prod-compute`. _(Claude, 10 min)_
6. **Force ECS redeploy** to pick up the new image + new secrets. _(Claude, 2 min, ~2 min for rollout)_
7. **Verify:** `/api/health` returns `"database":"connected"`. _(Claude)_
8. **Verify:** `/portal/tpa` and `/portal/provider` return 200 not 404. _(Claude)_
9. **Verify:** `/admin/signups` requires auth (auth bypass closed). _(Claude)_
10. **Verify:** POST `/api/signup-tpa` writes a real row to RDS. _(Claude — drives test signup)_

**Gate to Phase 2:** All 10 verifications pass. If any fails, stop and diagnose.

### Phase 2 — End-to-End Smoke Test (Monday late / Tuesday AM, 2h)
**Owner:** Claude (drives) + Jonah (observes)

Walk through the Wednesday Gate criteria 1-8 with a fake test TPA (`audit-probe@example.com`). Document every break point. Fix them.

Likely break points:
- HelloSign integration if `hellosign_client_id` is wrong shape
- Magic link email delivery (gated on SES — see Phase 4)
- Auto-assign concierge if no concierges exist in RDS (need to seed at least 1 delivery_lead + 1 concierge)
- Provider invitation flow if Cognito adapter throws NOT_IMPLEMENTED

**Gate to Phase 3:** Test signup completes through step 8 of Wednesday Gate.

### Phase 3 — Channel Infrastructure for Case Ingestion (Tuesday, 4-6h)
**Owner:** Claude + Jonah (design decisions)

**Wednesday Gate criterion 9 work.** Build the case ingestion surfaces with the design quality bar Jonah specified ("elegant, dead simple, beautifully designed").

**Sub-phases:**
- **3a — Roster + attribution (1h):**
  - `tpa_member_roster` table (covered lives per TPA)
  - `tpa_practice_assignments` table (which physician offices each TPA supports)
  - Migration 021
  - `intake_channel` enum on cases (`efax|email|voice_gr|phone_manual|portal_provider|portal_concierge`)
  - Attribution validator on case create (soft warn if practice not in TPA network)

- **3b — Concierge intake form (2h):**
  - Keyboard-first design
  - Patient autocomplete from TPA roster
  - Practice autocomplete from concierge's assigned offices
  - Voice dictation textarea for clinical context
  - Sub-2-second case creation
  - **Design reference:** Linear/Superhuman command-surface feel

- **3c — Provider portal submit (1h, mostly verification + polish):**
  - Form exists; verify it hits cases API correctly
  - Drag-anywhere PDF upload styling
  - AI face-sheet extraction confidence display
  - Confirmation screen with concierge contact info

- **3d — eFax channel verification (30 min):**
  - Trigger an eFax via Phaxio test number
  - Verify routing to correct concierge based on inbound number
  - Verify `intake_channel='efax'` set correctly

- **3e — Gravity Rail webhook contract (30 min):**
  - Document the JSON shape VantaUM expects from GR
  - Forward to Daniel Walmsley's team
  - **Not deployed Wed — coordination work**

**Gate to Phase 4:** Concierge can intake a case in <30 seconds via the form, provider can submit via portal, eFax case shows up attributed correctly.

### Phase 4 — Email + SES + HelloSign Real-Mode (Tuesday late, ~1h + async)
**Owner:** Jonah (DNS + ticket filing)

- Add DKIM CNAME records to vantaum.com DNS (Vercel DNS or wherever apex lives) — **Jonah**
- Wait for SES DKIM verification (auto-detects, ~10 min after DNS propagates)
- File AWS support ticket: "request SES production access for vantaum.com" — **Jonah**
- Test send: magic-link email from Cognito or admin invite flow
- HelloSign: verify the `hellosign_client_id` + `hellosign_api_key` are correct, send a test contract

**Gate to Phase 5:** Email sends from `noreply@vantaum.com`. Test contract sent successfully via Dropbox Sign.

### Phase 5 — Wednesday AM Final Verification (Wednesday, 30 min)
**Owner:** Jonah (cold walkthrough)

- Cold walkthrough with a fresh test email Jonah hasn't used before
- Run through Wednesday Gate criteria 1-12
- Sign off or surface remaining issues
- If issues: triage, fix the showstoppers, re-test

**Wednesday EOD: A real TPA can onboard. Send the URL to Kaylee.**

---

## Post-Wednesday Roadmap (Confirmed but Not Wednesday Scope)

### Week of 2026-05-19
- **Meow billing live:** Resume the 7-step bootstrap once Jonah creates dedicated VantaUM Meow account
- **SES production access** (24-48h after ticket filed)
- **Member Status Page** (rebuild lost mobile-Claude work — public token-gated `/m/[token]`)
- **Email channel ingestion** (mailbox poll → case create)
- **Gravity Rail webhook live** (provider voice intake → case create) — gated on GR workflow build
- **First TPA connector** (pick most-common TPA software based on Kaylee's stack)

### Month of 2026-06
- **RingCentral concierge provisioning** (gated on Maria Medrano DID concurrency answer)
- **TPA connector framework** (multiple connectors built off pattern)
- **Cognito auth cutover** (move off Supabase Auth)
- **URAC accreditation paperwork**
- **Reference accounts: target 3 paying TPAs by end of June**

### Q3 2026
- **VantaMD provider-side brief engine** (Phase 2 product, sequenced after enterprise foundation)
- **IDR/IRO arm scaffolding** (Phase 3 product)
- **Data migration Supabase → RDS** (deferred until volume justifies)
- **RDS multi-AZ** (cost +$60/mo, flip when revenue justifies)

---

## Architecture Reminders (Locked Decisions — Do Not Re-Litigate)

| Decision | Choice | Locked |
|---|---|---|
| Billing | **Meow, NOT Stripe** | 2026-05-13 |
| Auth (V1) | Supabase Auth (hybrid mode) | 2026-05-12 |
| Auth (V2) | AWS Cognito (post first 2-3 customers stable) | 2026-05-12 |
| Marketing host | Vercel (`vantaum.com`) forever | 2026-05-12 |
| App host | AWS Fargate (`app.vantaum.com`) forever | 2026-05-12 |
| Contract governance | State of Florida | spec |
| VantaUM contract signer | Jonathan Arias | spec |
| Voice/AI layer | Gravity Rail (NOT VantaUM-built) | 2026-05-12 |
| Telephony carrier | RingCentral → Gravity Rail → VantaUM | 2026-05-12 |
| Concierge weekly cap | 300 auths/week | spec |
| Practice group model | MP → 3P → 30AVP → 60DL → 600PL → 6000C | spec |
| Branding rule | No vendor names visible in UI (no "Anthropic", "Claude", "Supabase", "AWS") | spec |

---

## Identifiers (Quick Reference)

| Thing | Value |
|---|---|
| AWS account | 309921834034 |
| AWS region | us-east-1 |
| AWS CLI profile | `vantaum` |
| ALB | `vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com` |
| App URL | https://app.vantaum.com |
| Bastion | `i-0ac7f36a48ac8aacc` |
| RDS endpoint | `vantaum-prod-database-databaseb269d8bb-iruufzdfjweg.c4vqceyuu67e.us-east-1.rds.amazonaws.com:5432` |
| RDS admin secret | `vantaum-prod-db-admin-credentials` |
| Third-party secrets | `vantaum-prod-third-party-keys` |
| ECR repo | `309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app` |
| ECS cluster | `vantaum-prod` |
| ECS service | `vantaum-prod-app` |
| Cognito user pool | `us-east-1_CjZbn5TD4` |
| SES config set | `vantaum-prod` |
| Current image | `vantaum-prod-app:v2` (stale, May 12) |
| Target image | `vantaum-prod-app:v3` (to be built in Phase 1) |

---

## Workflow Rules for Future Sessions

If you're a fresh Claude thread reading this:

1. **Read this document. Do not relitigate locked decisions.** Re-read the architecture reminder table.
2. **Verify ground truth before trusting anything.** Run the audit commands at the top. If reality differs from this doc, update this doc — don't write a new doc.
3. **Back up unpushed work to origin immediately** as `claude/backup-<description>-<date>` branches before doing destructive work.
4. **Never push to `main` directly.** Open PRs.
5. **Never run RDS migrations or AWS deploys without explicit confirmation from Jonah** unless you're executing a step in this roadmap that's already locked.
6. **Update this document as phases complete.** Mark checkboxes. Move items between sections as scope shifts.
7. **If you're hitting compaction:** ensure ROADMAP.md is current and pushed before context runs out.

---

## Open Decisions Waiting on Jonah

1. **Design references** for the concierge intake form — what products' feel to match? (Linear / Superhuman / Stripe / Notion / other)
2. **Roster source** — does TPA upload CSV during onboarding (Phase 3a)? Or accept any patient at case create and concierge confirms?
3. **In-network attribution** — hard fail or soft warn if practice not in TPA's network?
4. **New VantaUM Meow account** — has it been created? (Gates billing resume.)
5. **Pre-Wed seeding** — who creates the test delivery_leads + concierges rows in RDS so auto-assign has a pool? Jonah inputs real org chart, or Claude seeds with placeholder data for smoke testing?
6. **SES DKIM DNS** — where does vantaum.com apex DNS live? (Vercel DNS / Cloudflare / Route53) — needs DKIM CNAME records.

These don't block Phase 0 or the start of Phase 1 (CDK change + container rebuild can begin immediately).

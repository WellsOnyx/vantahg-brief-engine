# Production Readiness Runbook

Operator checklist for going from a fresh clone to "first real customer can use this." Each step is verifiable and idempotent — re-running won't break anything that already worked.

Targets the path: **demo → fully configured → first real case landed**. Total time on a clean Supabase project: ~30 minutes.

---

## Phase 1 — Configure environment variables

The system gracefully falls back to demo when env vars are missing. That's safe for local dev and *dangerous* for first-customer onboarding, because a silent demo run looks identical to a working real one. **Trust the status banner on `/admin/usage`, not the absence of errors.**

In `.env.local` (local) or your Vercel project settings (deployed):

```bash
# Supabase — required for any non-demo run
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server-only>

# Anthropic — required for live brief generation + eFax extraction
ANTHROPIC_API_KEY=<console.anthropic.com key>
ENABLE_REAL_ANTHROPIC=true       # explicit opt-in; key alone is not enough

# Cron — required in production so /api/cron/* refuses anonymous calls
CRON_SECRET=<long random string>

# Optional (no fallback warnings if absent)
PHAXIO_API_KEY=<...>             # only if accepting faxes
PHAXIO_API_SECRET=<...>
PHAXIO_CALLBACK_TOKEN=<webhook signing>
GOOGLE_VISION_API_KEY=<...>      # OCR for eFax docs
SENTRY_DSN=<...>
```

The `ENABLE_REAL_ANTHROPIC` flag is intentional. Setting `ANTHROPIC_API_KEY` alone keeps real calls disabled — useful when a staging environment holds the key but should still run in demo mode.

---

## Phase 2 — Apply the schema

```bash
# Via the Supabase CLI:
supabase db push

# Or paste each file under supabase/migrations/ into the SQL editor
# in order (000 → 001 → 002 → ...).
```

Required tables for the smoke flow: `clients`, `reviewers`, `cases`, `audit_log`, `intake_log`, `user_profiles`. If you're accepting faxes also: `efax_queue`. Emails: `email_queue`.

---

## Phase 3 — Bootstrap the first customer

`scripts/bootstrap-real-client.ts` creates the first TPA / health plan plus a minimal reviewer roster (1 LPN + 1 RN + 1 MD). Idempotent — re-running with the same `--client-name` only inserts what's missing.

```bash
npx tsx scripts/bootstrap-real-client.ts \
  --client-name "Acme TPA" \
  --client-type tpa \
  --contact-email ops@acme.example \
  --lpn-name "Pat LPN"   --lpn-email pat@vantaum.example \
  --rn-name  "Sam RN"    --rn-email sam@vantaum.example \
  --md-name  "Dr. Jamie Smith" --md-email jamie@vantaum.example \
  --md-specialty "Internal Medicine"

# Preview without writing:
#   --dry-run
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment. Refuses to run with anon credentials.

---

## Phase 4 — Verify the status banner says **ready**

This is the gate that distinguishes "real" from "still in demo by accident."

1. Sign in at `/login` and assign yourself the `admin` role in Supabase (table `user_profiles`, set `role = 'admin'` on your row).
2. Visit `/admin/usage`.
3. The banner at the top should read **"Real mode — all required components ready"** with green dots on Supabase, Anthropic, and Cron.

If anything is yellow or red, expand "Show next steps to complete setup" — each missing piece names the exact env var to fix. Iterate on Phase 1 until the banner is green.

Optional components (eFax / OCR / Sentry) can stay red — they don't block the core flow.

---

## Phase 5 — Run the end-to-end smoke test

```bash
npm run test:e2e-synthetic
```

This drives a synthetic case through the full pipeline against your real Supabase + Anthropic environment:

1. Pre-flight: real-mode status banner reports **ready** (fails fast otherwise)
2. Bootstrap state present (at least one client + one MD reviewer)
3. Creates a synthetic intake case (clearly marked, fake patient — `SMOKE-<timestamp>`)
4. Generates the clinical brief + fact-check (real Anthropic call, ~$0.02–0.05)
5. Records an MD determination
6. Generates the brief PDF (asserts `%PDF-` header + reasonable size)
7. Verifies every expected audit event is present (`case_created`, `brief_generation_started`, `brief_generation_completed`, `fact_check_completed`, `determination_made`)

A `✅ Full end-to-end flow successful` line means every layer below the HTTP boundary works. Add `-- --cleanup` to remove the synthetic case after.

If the smoke fails, the script names which step failed with a PHI-safe reason and an actionable hint.

---

## Phase 6 — Submit the first real case

Pick the intake channel your first customer will use:

- **Portal**: `/cases/new` (internal staff entering on behalf of the provider)
- **API**: `POST /api/external/submit` with HMAC-signed body
- **Email**: forward to the configured inbound address
- **eFax**: fax to the Phaxio number (requires PHAXIO_* env vars)

Watch the case appear in `/cases`. Open it, generate the brief, download the PDF — that's the full output loop.

`/admin/usage` should show the case count, intake-by-channel breakdown, and (after the brief generates) estimated Anthropic cost ticking up.

---

## Phase 7 — Monitor as real usage starts

**Where to look when something's off:**

| Signal | Where it lives | What it tells you |
|---|---|---|
| `/admin/usage` | UI | Briefs generated this month, token usage, cost, intake by channel, active cases, SLA compliance |
| `audit_log` table (Supabase) | DB | Every PHI access, determination, intake, error (sanitized — class + code only, no raw messages). Filter `action LIKE 'security:%'` for auth failures and tenant-isolation denials. |
| `audit_log` action='client_portal_list_viewed' | DB | When TPA users actually load their dashboard |
| `audit_log` action='portal_lookup' | DB | Public portal lookup volume — early signal of prospect interest |
| Vercel function logs | Vercel UI | Structured `[api-error] kind=... code=...` lines and `[efax-process] ...` cron output |
| Sentry (if configured) | sentry.io | Unhandled exceptions and their stack traces |

**Tenant-isolation incidents to watch for:** `security:case_access_denied` actions in `audit_log`. These mean a client user tried to access a case that isn't theirs. Investigate any spike.

**Cost incidents:** if `/admin/usage` shows a sudden jump in estimated cost without a matching jump in briefs generated, the retry loop in `lib/generate-brief.ts` may be re-trying invalid model output unusually often. Check `brief_generation_invalid_payload` audit events.

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Status banner stays yellow even after setting all env vars | Vercel didn't redeploy after env update | Trigger a redeploy. `NEXT_PUBLIC_*` vars need a build to be inlined. |
| Briefs hang for 60s then fail | Anthropic timeout | Check Anthropic status; the SDK retries 5xx/429 automatically. `LLM_TIMEOUT_MS` env var raises the per-request timeout if needed. |
| Briefs fail validation 2x in a row | Model returning malformed structured output | `brief_generation_invalid_payload` audit events show the failed field paths. Usually transient — retry. If persistent, the model may need a prompt tweak in `lib/generate-brief.ts`. |
| Client dashboard shows zero cases despite cases existing | RLS not joining — `clients.contact_email` doesn't match the logged-in user's email | Update the client's `contact_email` (Supabase table editor) to match the user's login email. |
| Smoke test fails at "MD-credentialed reviewer" check | Bootstrap was run without `--md-name` | Re-run bootstrap with `--md-name --md-email --md-specialty`. |
| Cron endpoints return 401 | `CRON_SECRET` mismatch | The Vercel cron config sends Bearer `CRON_SECRET`. Confirm the env var matches both places. |

---

## Files to know

- `lib/env.ts` — env validation. Adding a new required var? Update both the zod schema and a helper like `isRealAnthropicEnabled()`.
- `lib/real-mode-status.ts` — drives the status banner. Add new components here when you add new providers.
- `lib/case-access.ts` — tenant ownership check. **Single source of truth** for "can this user touch this case?" — extend this rather than adding ad-hoc checks in routes.
- `lib/audit.ts` — all audit writes. `sanitizeForLogging` in `lib/security.ts` strips PHI before write.
- `scripts/bootstrap-real-client.ts` — first-customer setup.
- `scripts/smoke-e2e.ts` — end-to-end verification.

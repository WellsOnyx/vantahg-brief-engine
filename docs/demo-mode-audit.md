# Demo-mode bypass audit — admin routes

**Why this exists:** `e1615ed` closed the admin auth bypass at the
gate (`lib/auth-guard.ts`) — in prod demo mode, `requireAuth` /
`requireRole` now return 401 before any handler body runs. But every
admin route still has its own `if (isDemoMode())` short-circuit
inside the handler. Those branches return fake-success payloads on
write paths.

**Current reachability:**
- **Prod (NODE_ENV=production, isDemoMode=true):** unreachable. The
  auth-guard 401 fires first. These branches are dead code in prod
  today.
- **Dev / test / CI (NODE_ENV!=production, isDemoMode=true):** live.
  The mock admin returned by `requireAuth` lets the request proceed
  into the handler body. The `isDemoMode()` branch fires next.
- **Prod after `ENABLE_AWS_DB=true` is wired:** unreachable, because
  `isDemoMode()` returns false once Supabase keys are populated.

So the risk surface today is dev-experience, not prod security. If
`e1615ed` is reverted or `lib/auth-guard.ts` is later changed in a
way that lets demo-mode prod requests through, every HIGH-risk
branch below comes back live.

---

## Findings

| File | Line | Handler | Returns | Risk |
|---|---|---|---|---|
| `app/api/admin/signups/route.ts` | 26 | `GET` (list) | Hardcoded array of 2 demo TPA signup rows (Acme, Sunrise) with realistic-looking contact emails, addresses, member counts | **LOW** — read-only, no DB writes. The seed emails (`jane@acme.example`, `charles@acme.example`, `marco@sunrisehp.example`) are `.example` TLDs so they can't accidentally reach a real person. Fine. |
| `app/api/admin/signups/[id]/route.ts` | 29 | `GET` | Re-fetches the demo list above and looks up by id; 404 if no match | **LOW** — read-only. |
| `app/api/admin/signups/[id]/approve/route.ts` | 54 | `POST` | `{success: true, demo: true, message: 'Approve recorded (demo mode — no tenant created).'}` | **HIGH (dev-only)** — fake success on a write path. Caller (admin UI) renders "approved" but no tenant gets created, no Delivery Lead / Concierge auto-assignment fires, no welcome email goes out. Easy to mistake a dev test for "the feature works." |
| `app/api/admin/signups/[id]/reject/route.ts` | 44 | `POST` | `{success: true, demo: true, message: 'Reject recorded (demo mode — no row updated).'}` | **HIGH (dev-only)** — same pattern. Status doesn't change in DB; UI may show stale "pending_review" on next load. Rejection email is not sent. |
| `app/api/admin/signups/[id]/generate-contract/route.ts` | 65 | `POST` | `{success: true, demo: true, message: 'Contract generated (demo mode — no PDF persisted).', rendered_pdf_path: 'demo/<id>/generated.pdf'}` | **HIGH (dev-only)** — fake `rendered_pdf_path` is returned. If the UI hands that path to a download button or signed-URL request, the next request 404s. Worse: the variable values that drive contract generation (legal name, signer email, PEPM rate) are silently discarded — devs can't test that the template renders correctly. |
| `app/api/admin/signups/[id]/contract/route.ts` | 59 | `POST` (upload) | `{success: true, demo: true, message: 'Upload recorded (demo mode — no file persisted).', contract_storage_path: 'demo/<id>/contract.pdf'}` | **HIGH (dev-only) — PHI-adjacent** — the handler is invoked with `multipart/form-data` containing an actual PDF. The bypass fires before `request.formData()` is even called (line 59 is above the formData parse on line 70). The PDF bytes never leave the request stream — that's actually *safer* than writing it somewhere unencrypted — but a dev who uploads a real wet-signed BAA expecting it to persist will find it gone with no warning. Flagging because a wet-signed contract can contain identifiable signer info even if not strictly PHI. |
| `app/api/admin/signups/[id]/contract/route.ts` | 208 | `GET` (signed URL) | `{success: true, demo: true, url: '#demo-contract-not-real', expires_in_seconds: SIGNED_URL_TTL_SECONDS}` | **LOW** — read-only, returns a hash URL that won't navigate. |
| `app/api/admin/invoices/route.ts` | 58 | `GET` (list) | `{invoices: DEMO_INVOICES}` (hardcoded demo invoice rows) | **LOW** — read-only. |
| `app/api/admin/invoices/route.ts` | 104 | `POST` (generate) | `{success: true, demo: true, invoice_id: 'demo-inv-new', invoice_number: 'VUM-INV-DEMO-00003'}` | **HIGH (dev-only)** — caller believes a PEPM invoice was created. No local `invoices` row written, no Meow push, no `meow_invoice_id`, no payment URL. A dev testing the billing path against demo mode never exercises the actual `generateInvoice()` code path that calls Meow. |
| `app/api/admin/contracts/[id]/send-for-signature/route.ts` | 47 | `POST` | `{success: true, demo: true, message: 'Sent for signature (demo mode — no real envelope created).', signature_request_id: 'demo-sig-<id>', status: 'sent'}` | **HIGH (dev-only)** — caller believes a HelloSign envelope was created and an email went to the signer. None of that happened. Worse than the others because the fake `signature_request_id` could be stored by a poorly-tested caller and then 404 forever after on follow-up status checks. |
| `app/api/admin/contracts/[id]/void/route.ts` | 41 | `POST` | `{success: true, demo: true}` | **HIGH (dev-only)** — caller believes the contract is voided. No DB write, no HelloSign cancel-envelope. If a real envelope was sent (which can't happen in demo mode but could in a partial config) the actual signer can still sign. |
| `app/api/admin/contracts/[id]/resend/route.ts` | 35 | `POST` | `{success: true, demo: true, message: 'Reminder sent (demo mode).'}` | **MEDIUM (dev-only)** — fake success but the failure mode (reminder not actually sent) is recoverable by hitting Send again. |

**Total:** 12 `isDemoMode()` branches across 9 admin route files.
- 4 LOW (read-only)
- 1 MEDIUM (recoverable write)
- 7 HIGH (fake success on a write path)

---

## PHI leak check

No branch returns real PHI. The demo signup data uses `.example`
TLDs and fictional names. The contract upload POST (the only PHI-
adjacent path) discards the uploaded bytes rather than writing them
anywhere, so there's no plaintext-PHI-on-disk risk. The hardcoded
demo invoice data is synthetic.

**One thing to watch:** if a dev pipes a real PDF into the upload
route during local testing, the file content lives in process memory
for the duration of the request and then is GC'd. Not a leak, but
something to be aware of for HIPAA-aware testing — use synthetic
PDFs in dev.

---

## Recommended cleanup (not for this branch — scoped for a later cleanup PR)

The HIGH-risk branches all have the same shape: "return a fake
success payload that the UI treats as real." Three options for
addressing them, in increasing rigor:

1. **Status quo (cheapest).** Leave them. They're dead in prod after
   `e1615ed`. Devs working with demo mode already know what to
   expect. Document this audit and move on.
2. **Add `X-Demo-Mode: true` header to the response.** Browser
   devtools surface it, makes "this didn't actually do anything"
   visible without changing the response body shape.
3. **Refactor the bypass out of each handler.** Have the demo-mode
   responses live in a single `lib/demo-mode/admin-responses.ts`
   module, with each response keyed off the route. Easier to audit
   in one place; easier to delete wholesale when demo mode is
   retired. Larger diff, more test churn.

Recommend #2 if anyone has a free hour. It's the smallest change
with the largest dev-clarity gain. #3 is correct but it's
make-work right now.

**Critical: do not change any of these handlers without re-verifying
the `e1615ed` auth-guard fix is still in place.** If the gate stops
401'ing prod demo mode, every HIGH-risk branch becomes a prod
exploit vector again.

---

## Cross-check against the auth-guard test suite

`__tests__/lib/auth-guard.test.ts` (added in `e1615ed`) has three
tests covering:
1. non-prod demo mode → mock admin returned (preserves dev flow)
2. prod demo mode → 401 returned (closes the bypass)
3. prod demo mode via `requireRole(['admin'])` → 401 (defense in
   depth)

Those three tests are the only thing keeping the HIGH-risk branches
in this audit unreachable in prod. Treat them as load-bearing — if
anyone changes `lib/auth-guard.ts` they need to be re-verified
manually before merge.

# End-to-End Test: TPA Signup → Contract → Signature → Portal Access (Item 20)

This document describes the complete happy-path flow that must work for a real TPA to onboard themselves through the self-serve experience.

**Goal**: A prospect can go from filling out `/signup-tpa` all the way to having working access to `/portal/tpa` with their cases scoped correctly, without manual intervention after contract signature.

---

## Prerequisites (one-time)

- HelloSign/Dropbox Sign keys configured and `ENABLE_REAL_HELLOSIGN=true` (or use demo mode carefully)
- Email delivery working (SES or Supabase SMTP for magic links)
- Admin user with role `admin` or `ceo` who can approve signups
- Jonathan Arias' email (`jonathan@wellsonyx.com` or whatever is configured as VantaUM signer) can receive HelloSign emails
- Test TPA email you control (e.g. `test-tpa-01@yourdomain.com`)

---

## Full Flow Test Steps

### 1. TPA Self-Serve Signup
- Go to: `https://app.vantaum.com/signup-tpa` (or local equivalent)
- Fill out the full form with realistic data:
  - Legal name, DBA, entity state, address
  - Primary contact + signer details (use an email you control)
  - Estimated members, expected weekly auths, PEPM (leave blank or set one)
  - Existing TPA system + notes
- Submit
- **Verify**:
  - Success message
  - Row appears in `signup_requests` with status `pending_review`
  - Admin receives no email yet (by design)

### 2. Admin Review & Approval
- Log in as admin → go to `/admin/signups`
- Open the new signup
- **Verify** all data from step 1 is displayed correctly
- Set a PEPM rate (e.g. 0.85)
- Click **Approve**
- **Verify**:
  - `clients` row is created with the correct `contact_email`
  - `signup_requests.status` becomes `approved`
  - Auto-assignment to a concierge/Delivery Lead happens (check the success message)
  - Audit events for approval + assignment

### 3. Admin Generates Contract (with optional injection)
- On the same detail page, in the Contract section:
  - Optionally fill in the **Additional Provisions** textarea
  - Click **Generate MSA**
- **Verify**:
  - PDF is generated and stored in `signup-contracts` bucket
  - `contracts` row is created with status `generated`
  - `signup_requests.contract_storage_path` is populated
  - If you put text in Additional Provisions, it appears in the generated PDF under the correct section

### 4. Admin Sends Contract for Signature
- Click **Send for signature**
- **Verify**:
  - HelloSign envelope is created (check dashboard or audit log)
  - `contracts.status` → `sent`
  - `contracts.hellosign_signature_request_id` is stored
  - TPA signer receives email from Dropbox Sign
  - Jonathan Arias also appears as second signer

### 5. TPA Signs the Contract (first signer)
- Open the email as the test TPA
- Complete the HelloSign signature flow
- **Verify** (in HelloSign dashboard or via webhook logs):
  - `signature_request_signed` event received
  - `contracts.status` → `partially_signed`

### 6. VantaUM (Jonathan) Counter-Signs
- Jonathan receives the counter-sign request
- Completes signature
- **Verify**:
  - HelloSign sends `signature_request_all_signed`
  - Webhook updates:
    - `contracts.status = 'signed'`
    - `contracts.signed_at` is set
    - `signup_requests.status = 'signed'`

### 7. Post-Signature Provisioning (the critical handoff)
- In the webhook handler for `signature_request_all_signed`:
  - `provisionTpaUserAndMagicLink` is called
  - Auth user is created (or already existed)
  - `user_profiles` row is upserted with:
    - `role = 'client'`
    - `client_id` linked to the correct tenant
  - Magic link is generated

- **Verify**:
  - `user_profiles` has the correct role + client_id
  - Magic link email is delivered (check inbox or Supabase logs)
  - Audit event `contract_all_signed` with `user_provisioned: true`

### 8. TPA Receives Magic Link & Accesses Portal
- Click the magic link as the test TPA
- Complete any remaining auth steps
- **Verify**:
  - User lands at `/portal/tpa`
  - `/api/tpa/me` returns the correct client + practices
  - Dashboard shows the TPA name and empty or demo cases
  - User can navigate to Submit Case and Practices

### 9. End-to-End Validation
- Submit a test case via the TPA portal
- **Verify**:
  - Case is created with correct `client_id` and `practice_id`
  - Case appears in the TPA's "My Cases" view (scoped correctly)
  - Internal admin can also see the case under the right client

---

## Known Gaps / Future Polish (as of May 2026)

- Magic link email is currently delivered by Supabase SMTP. When fully cut over to AWS we should send via SES with a branded template.
- No automated test yet for the full HelloSign + provisioning path (Item 20 is manual verification + this runbook).
- Contract status on the `clients` table is not yet being updated on signature (nice-to-have for billing).
- Redirect after magic link currently goes to `/portal/tpa` — confirm this is the final desired landing page.

---

## How to Re-run this Test Quickly

1. Use a fresh test email each time (or delete the auth user + client row).
2. Keep the HelloSign test mode on until you're confident.
3. Watch logs on the HelloSign webhook route for `contract_all_signed`.
4. Check `user_profiles`, `clients`, `contracts`, and `signup_requests` tables after each signature.

---

**Owner**: Jonah / future sessions  
**Status**: Ready for manual execution as of the completion of Item 19.

Run this checklist end-to-end at least once with a real HelloSign envelope before considering the TPA self-serve onboarding "production ready."
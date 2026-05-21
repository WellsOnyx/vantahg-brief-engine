# Real End-to-End Test Runbook (Non-Demo)

**Purpose:** Step-by-step instructions to test the full TPA onboarding + case submission flow using real (non-demo) paths. This is the validation Cole and the team will use after the Fargate deploy.

**Target:** Prove we can onboard a TPA that covers 500,000 lives.

---

## Prerequisites

- You have admin access (Cognito or current hybrid)
- A test email you control (for contract signing and notifications)
- Real HelloSign API key configured in the environment
- `ENABLE_AWS_DB=true` (or the real RDS path active)
- Real Anthropic key (for actual brief generation)

---

## Full Flow Test Steps

### Step 1: Create a Test TPA Signup (Admin)

1. Go to `/admin/signups`
2. Create a new signup request with realistic data:
   - Company name: "Test TPA - 500k Lives"
   - Contact info using your test email
   - Expected weekly auths: 1200 (represents significant volume)
3. Submit

**Expected:** Signup appears in the pending review list.

### Step 2: Admin Reviews and Approves + Generates Contract

1. Open the signup in `/admin/signups/[id]`
2. Review the details
3. Generate the contract (using the approved Florida + Jonathan Arias template)
4. Send for signature via HelloSign

**Expected:** 
- Contract is sent to the test email
- Status updates to "contract_sent"
- Email notification is received (real, not demo)

### Step 3: Sign the Contract (as the "TPA")

1. Open the HelloSign email and complete the signature
2. After signing, the webhook should fire

**Expected:**
- Status moves to "approved"
- Client record is created in the real database (RDS)
- TPA user account with portal access is provisioned
- Confirmation email is sent

### Step 4: TPA Logs Into Portal and Submits First Case

1. Use the magic link or login to reach `/portal/tpa`
2. Navigate to case submission (`/portal/tpa/submit`)
3. Fill out a realistic pre-authorization request:
   - Patient info
   - Procedure codes (use real CPTs)
   - Diagnosis codes
   - Upload at least one supporting document (PDF)
4. Submit

**Expected:**
- Case is created in RDS with correct `client_id`
- Status = "intake" or "processing"
- Initial concierge assignment happens automatically
- Brief generation is triggered with real Anthropic (multi-pass self-critique runs)

### Step 5: Verify Brief + Fact Check

1. As a concierge (or admin), go to the case in the review queue
2. Open the case detail
3. Confirm:
   - AI Brief is present with `generation_metadata` showing passes
   - Fact check results (Two-Midnight + Fidelity Guard) are attached
   - `human_review_recommended` flag is set appropriately

### Step 6: Concierge Validates the Brief

1. Use the `ConciergeValidationForm`
2. Enter a real clinical rationale (≥30 characters)
3. Acknowledge fact-check if flagged
4. Submit

**Expected:**
- Status advances (e.g., to `lpn_review` or next stage)
- Audit log entry created with full rationale
- DeterminationForm becomes available

### Step 7: Make a Determination (with AI Risk Signals)

1. Open DeterminationForm
2. Observe the Denial Strength / Appeal Likelihood banner (if denying)
3. If high risk, the mandatory acknowledgment checkbox should appear
4. Enter rationale and submit (approve, deny, or partial)

**Expected:**
- Determination is saved
- Feedback (agreement/disagreement) is captured for future AI improvement
- Case status updates correctly

### Step 8: Verify Delivery Lead Visibility

1. As a Delivery Lead, open the Delivery Lead Dashboard
2. Confirm the new concierge + case load appears in real data (not demo fixtures)
3. Test a reassign action with a required reason

**Expected:** Reassign succeeds, updates RDS, writes audit.

---

## Success Criteria for 500k Lives Readiness

- [ ] Entire flow completed with zero demo-mode shortcuts active
- [ ] Real emails received (contract + signature + notifications)
- [ ] Brief generated with real Anthropic + fact-check persisted
- [ ] All data lives in RDS (not Supabase demo tables)
- [ ] Audit trail is complete and defensible
- [ ] No errors in the Fargate logs during the flow

---

## Troubleshooting Common Issues

- **Brief generation fails**: Check Anthropic key and rate limits. Look at `generate-brief.ts` error handling.
- **No email received**: Check Resend/Email provider + `lib/notifications.ts` guards.
- **TPA cannot log in after signature**: Check post-signature provisioning logic and Cognito user creation.
- **Case not visible in Delivery Lead**: Verify the new concierge assignment and `client_concierge_assignments` table.

---

## Notes for Cole

When you deploy the new Fargate image, run this exact runbook end-to-end before declaring the environment stable for real TPAs.

This runbook will be the acceptance test for the production cutover.

---

**Document Owner:** Grok (first chair) — will keep this updated as we remove more demo guards.
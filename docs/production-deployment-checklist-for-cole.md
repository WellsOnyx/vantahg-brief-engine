# Production Deployment Checklist for Cole (Fargate + 500k Lives Readiness)

**Prepared:** 2026-05-21  
**Owner:** Cole (Fargate / Infrastructure)  
**Goal:** Get the latest `main` running on real `app.vantaum.com` with Cognito + RDS as primary, so we can support onboarding a TPA covering 500,000 lives.

---

## 1. Pre-Deployment Requirements (Must Be True Before Image Push)

- [ ] Latest `main` is green (`npm run build` passes cleanly)
- [ ] All critical demo-mode guards in these paths are removed or properly gated behind `isDemoMode()` only for non-production:
  - TPA signup + contract sending
  - Post-signature provisioning
  - Case submission + document handling
  - Brief generation + fact-check persistence
  - Notifications (contract sent, signed, case status)
- [ ] `AWS_PROFILE=vantaum` and proper secrets are available in the build environment
- [ ] No raw AWS keys committed anywhere

---

## 2. Fargate Task Definition Updates (Critical)

These must be set correctly for the real environment:

### Required Environment Variables (Real Values)
```
ENABLE_AWS_DB=true
DATABASE_URL=... (RDS connection string)
DB_HOST=...
DB_PORT=5432
DB_NAME=...
DB_USER=...
DB_PASSWORD=... (from Secrets Manager)

# Cognito (primary auth)
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...

# HelloSign / Dropbox Sign
HELLOSIGN_API_KEY=...
HELLOSIGN_CLIENT_ID=...

# Notifications
RESEND_API_KEY=... (or equivalent)

# Gravity Rail (when instance is ready)
NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID=...
NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID=...
GRAVITY_RAIL_API_KEY=...

# Anthropic (real, not demo)
ANTHROPIC_API_KEY=...
```

### Secrets Manager Recommendations
- Move all sensitive values (DB password, API keys, Cognito secrets) into AWS Secrets Manager.
- Reference them in the task definition using `secrets` array instead of plain env vars where possible.

### Platform & Architecture
- Platform: `linux/arm64` (must match our arm64 builds)
- CPU / Memory: Size appropriately for 500k lives scale (start with 2 vCPU / 4GB, monitor)
- Desired Count: At least 2 for high availability

---

## 3. Post-Deployment Verification Steps

After the new image is running on Fargate:

1. **Health Check**
   - Hit `/api/health` or root — confirm 200
   - Confirm no demo mode banner is visible on internal pages (if we gate it)

2. **Auth Flow**
   - Test Cognito login for internal roles (admin, delivery-lead, concierge)
   - Confirm TPA magic link / login works via Cognito (or current hybrid)

3. **TPA Onboarding Flow (Real Path)**
   - Create a test signup as admin
   - Generate and send contract via HelloSign (real)
   - Have a test user sign it
   - Verify post-signature: client + user access created in RDS
   - Confirm TPA can log into `/portal/tpa`

4. **Case Submission**
   - TPA uploads a real case with documents
   - Confirm case lands in RDS with correct `client_id` and `concierge_id`
   - Brief is generated with real Anthropic call (not demo)

5. **Notifications**
   - Contract sent email received
   - Signature confirmation email received
   - Case status change notifications fire

6. **Delivery Lead Dashboard**
   - Real data appears (not just demo fixtures)
   - Reassign works and updates RDS + audit log

7. **AI Layer**
   - Multi-pass self-critique runs
   - Fact-check + Two-Midnight + Fidelity Guard results persist
   - Appeal likelihood / risk signals appear in DeterminationForm

---

## 4. Rollback Plan

- Keep previous task definition revision as a quick rollback target.
- Have a way to flip `ENABLE_AWS_DB=false` temporarily if needed (emergency only).

---

## 5. Monitoring & Observability (Minimum for 500k Lives)

Before considering the deploy stable:
- Basic logging to CloudWatch
- Error tracking (recommend Sentry or equivalent)
- Simple health checks + alarms on 5xx rates or high latency

---

## 6. Items We (Grok Team) Are Responsible For Before You Deploy

We will deliver before Tuesday:
- Production Deployment Checklist (this doc)
- Systematic removal of demo guards in critical paths
- Real End-to-End Test Runbook
- Updated `remaining-work-for-developer.md` with exact handoff state
- Branch cleanup (main is single source of truth)
- Internal Copilot improvements
- Notification hardening

---

## 7. Open Questions for You (Cole)

- Do you want us to remove **all** `isDemoMode()` guards before the first Fargate image, or only the ones in the TPA/contract/case flow?
- Preferred approach for secrets: full Secrets Manager now, or gradual?
- Target CPU/Memory for first production deployment?
- Any preference on how many tasks (minimum 2 for HA)?

---

**When this checklist is green and the image is live on Fargate with real Cognito + RDS, we are in a position to start onboarding real TPAs at 500k lives scale.**

This is the artifact Cole needs when he returns. We will keep refining it aggressively.
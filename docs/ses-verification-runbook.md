# SES domain verification runbook — vantaum.com

**Why this exists:** `vantaum-prod-email` CDK stack is deployed and the
configuration set + bounce-handling SNS topic + suppressions table are
all in place. But SES has **zero verified identities** in account
`309921834034` / `us-east-1`. Every outbound email path (magic-link,
signup-receipt, signed-contract notification, invoice reminder)
silently fails because SES rejects `From: noreply@vantaum.com` without
a verified domain.

**Async path:** AWS support ticket for production access is 24–48h.
Verifying the domain itself is ~10 minutes of config plus ~5–30
minutes for DNS propagation. Both run in parallel: file the ticket
the same time you add the DKIM CNAMEs.

**Owner:** can be executed by Jonah on phone or desktop — every step
is AWS Console + Squarespace DNS, no CLI tooling required. Detailed
enough that a fresh-thread Claude session could walk through it too.

---

## Step 1 — Add the domain in SES (Console, ~5 min)

1. AWS Console → switch profile to `vantaum`, region `us-east-1`
2. SES → **Verified identities** → **Create identity**
3. Identity type: **Domain**
4. Domain: `vantaum.com`
5. Tick **Use a custom MAIL FROM domain** → enter `mail.vantaum.com`
   (this is what shows up in bounce paths; using a subdomain is
   recommended so bounces don't conflict with the main marketing
   site's MX records)
6. **Advanced DKIM settings** → tick **Easy DKIM**, key length
   **RSA 2048-bit**
7. **Publish DNS records to** → choose **I'll publish DNS records
   manually** (we use Squarespace DNS, not Route 53)
8. **Custom configuration set** → select `vantaum-prod` (the existing
   config set from the email stack)
9. Create identity

SES will return you to the identity detail page with:
- 3 DKIM CNAME records under **DomainKeys Identity Mail**
- 2 MAIL FROM records (1 MX, 1 TXT) under **Custom MAIL FROM domain**
- Status: **Verification pending**

**Copy all 5 records to a temporary scratch pad.** Each one has the
form `<token>._domainkey.vantaum.com` (DKIM) or `mail.vantaum.com`
(MAIL FROM). Get the exact strings from the Console — they vary per
account and are not predictable.

---

## Step 2 — Add records to Squarespace DNS (~5 min)

STATE.md line 507–509 references `vantaum.com` records already in
Squarespace DNS (the `app.vantaum.com` CNAME + the ACM validation
CNAME for that cert). Add the 5 new SES records using the same
pattern.

1. Squarespace → Settings → Domains → `vantaum.com` → **DNS Settings**
2. For each of the 3 DKIM records (each looks like
   `<token>._domainkey` for the host, `<token>.dkim.amazonses.com.`
   for the value):
   - Type: `CNAME`
   - Host: `<token>._domainkey` (NOT `<token>._domainkey.vantaum.com`
     — Squarespace appends the domain automatically; if you include
     it you'll end up with `._domainkey.vantaum.com.vantaum.com`)
   - Data: `<token>.dkim.amazonses.com.` (keep the trailing dot;
     Squarespace strips it if needed)
3. For the MAIL FROM MX record:
   - Type: `MX`
   - Host: `mail`
   - Priority: `10`
   - Data: `feedback-smtp.us-east-1.amazonses.com.`
4. For the MAIL FROM TXT record:
   - Type: `TXT`
   - Host: `mail`
   - Data: `"v=spf1 include:amazonses.com ~all"` (with the surrounding
     quotes — Squarespace's TXT editor handles them correctly)
5. Save

Records propagate in ~5–30 minutes. You can spot-check from a
terminal:

```bash
dig +short CNAME <token>._domainkey.vantaum.com
# Expect: <token>.dkim.amazonses.com.

dig +short MX mail.vantaum.com
# Expect: 10 feedback-smtp.us-east-1.amazonses.com.

dig +short TXT mail.vantaum.com
# Expect: "v=spf1 include:amazonses.com ~all"
```

If `dig` returns nothing, DNS hasn't propagated yet. Wait 5 minutes
and retry. SES re-checks every ~3 minutes and will flip the identity
status from "Verification pending" to "Verified" automatically.

---

## Step 3 — Wait for SES verification (~5–30 min, async)

In the SES Console → Verified identities → `vantaum.com`:
- **Identity status** flips from yellow "Verification pending" to
  green "Verified"
- **DKIM configuration** flips to green "Successful"
- **Custom MAIL FROM domain** flips to green "Successful"

All three need to be green. If after 1 hour any are still yellow,
re-check the DNS records in Squarespace — most likely cause is the
host field accidentally included `.vantaum.com` and Squarespace
stored it as `<token>._domainkey.vantaum.com.vantaum.com`.

**What "verified" looks like — concrete example:**
```
Identity:       vantaum.com           [Verified]
DKIM:           RSA 2048-bit          [Successful]
MAIL FROM:      mail.vantaum.com      [Successful]
SPF alignment:  Pass
DMARC alignment: Pass (if DMARC TXT exists; optional for V1)
```

---

## Step 4 — File the production access request (~5 min, separate
24–48h async)

SES new accounts are in **sandbox mode** by default. Sandbox restricts
sending to **verified destination addresses only** and caps at **200
emails/day / 1 email/second**. We need production access to send to
arbitrary customer/signer emails.

File the request **before** verification completes — it processes in
parallel and the 24–48h SLA starts from when you file.

1. AWS Console → SES → **Account dashboard** → top banner says "Your
   account is in the sandbox" → click **Request production access**
2. Mail type: **Transactional**
3. Website URL: `https://vantaum.com`
4. Use case description (template wording — adjust as needed):

   > VantaUM is a HIPAA-compliant utilization review platform serving
   > self-insured TPAs and provider practices. We send transactional
   > emails to customers and signers in three flows:
   >
   > 1. Sign-up receipt confirmation — when a TPA submits the
   >    `/signup-tpa` form, we send a single receipt email confirming
   >    their request and outlining next steps.
   > 2. Contract signing notifications — when a contract is sent for
   >    e-signature via HelloSign, we send a notification email to
   >    the authorized signer of record.
   > 3. Magic-link authentication — once a customer is approved, we
   >    send a one-time magic link to their registered email so they
   >    can access the customer portal.
   >
   > All recipients are explicit business contacts (named signers and
   > authorized portal users) who have submitted information to us
   > directly. We do not send marketing email from this account.
   > Estimated volume: <100 emails/day for the next 6 months. Bounce
   > handling: SNS topic + suppressions table; bounce rate < 2%
   > expected. Complaint rate target: < 0.1%. No mailing lists, no
   > batch sends.

5. Additional contacts: leave blank (defaults to root account email)
6. Preferred contact language: English
7. Submit

You'll get an AWS support case ID. Save it to STATE.md. AWS responds
within 24–48h; if they push back, they usually ask for clarification
on volume or bounce handling — answer concisely and they typically
approve on the follow-up.

---

## Step 5 — Test send (after verification + production access)

This is the smoke test that confirms everything end-to-end. Run
from anywhere with the `vantaum` profile configured.

```bash
# Send a simple test message to your own email. The --from must be
# the verified identity; the --to is any address once you're out of
# sandbox.
aws ses send-email \
  --profile vantaum --region us-east-1 \
  --from "noreply@vantaum.com" \
  --destination "ToAddresses=jonah@wellsonyx.com" \
  --message '{
    "Subject": {"Data": "SES smoke test from vantaum.com"},
    "Body": {
      "Text": {"Data": "If you see this, SES is verified and out of sandbox."}
    }
  }' \
  --configuration-set-name vantaum-prod
```

Expected: `MessageId` returned, email arrives in inbox within 30s.

If it fails:
- `MessageRejected: Email address is not verified` → either the
  identity isn't actually verified yet (re-check Step 3) or you're
  still in sandbox and the destination email isn't verified
- `MessageRejected: Sending paused for this account` → AWS has
  paused sending due to bounce/complaint rate; check the SES Account
  dashboard for the reason
- No `MessageId` returned → CLI auth or config-set name issue

Once the test send works, the next phase is making the app actually
call SES instead of stubbing email. Check
`lib/notifications/email-adapter.ts` for the adapter — `ENABLE_AWS_EMAIL=true`
should already be set (line 163 of `infra-aws/lib/compute-stack.ts`)
but the underlying send method needs to be wired to the AWS SDK SES
client. That's a separate work item — out of scope for this runbook.

---

## Step 6 — Update STATE.md after verification completes

When the SES identity flips to Verified AND the production access
ticket is approved, append a note to STATE.md's "What's not yet done"
section moving the SES line from open to resolved. Record:
- Verification date
- Production access approval date + AWS case ID
- The DKIM tokens (for future debugging if records are accidentally
  deleted)

---

## Rollback

There's no rollback for "verified a domain in SES." If something goes
sideways, you can:
1. Delete the SES identity in the Console (immediate)
2. Remove the 5 DNS records from Squarespace (~10 min for caches to
   clear)
3. Restart the process

The DKIM CNAMEs are harmless even if left in DNS after deleting the
identity — they just point to amazonses.com keys that no longer
authorize sends.

---

## Verified-vs-not behavior matrix

| State | App can send? | Customer impact |
|---|---|---|
| No identity | No | Magic links never arrive; signup confirmations fail silently |
| Identity created, DNS not propagated | No | SES rejects all sends with `Email address not verified` |
| Identity verified, still in sandbox | Yes, only to verified addresses | Internal team can receive test emails; real customers can't |
| Identity verified + production access | Yes, to anyone | Production-ready |

The current state is row 1. Steps 1–4 of this doc move us to row 4.
Steps 1–2 move us to row 2 (~10 min). Step 3 moves us to row 3 (~30
min total). Step 4 (filed in parallel) moves us to row 4 in 24–48h.

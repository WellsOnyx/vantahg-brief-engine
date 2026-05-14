# Meow runtime bootstrap — resume checklist

**Status as of 2026-05-13:** paused. Blocked on Jonah provisioning a
new dedicated **VantaUM** account inside Meow (sub-account of Vanta HG
LLC, or its own entity — TBD). PEPM invoice payments must NOT route
into the existing Operating Account (8841) or IP Fees Account (2472)
under Vanta HG LLC.

This doc is the clean, executable version of STATE.md's "ACTIVE TASKS
RIGHT NOW" Meow section, pulled forward so the resume path doesn't
get buried under future updates.

---

## Context — what's already in place (DO NOT redo)

| Thing | Status |
|---|---|
| Meow API key | Created in Meow UI under **Vanta HG LLC** entity. Named "VantaUM". 8 scopes verified working. **Length 43 chars, last4 `Tv5s`.** Stored as `meow_api_key` in `vantaum-prod-third-party-keys`. **Do not regenerate without a reason.** |
| IP allowlist on the key | Contains `3.81.192.170` (Fargate NAT EIP). Bastion egresses via the same NAT. Verified working. |
| Bastion IAM permission | `vantaum-prod-compute-BastionRole201D3308-z9URw5kwddFg` has inline policy `ReadThirdPartySecret` granting `secretsmanager:GetSecretValue` on `vantaum-prod-third-party-keys`. |
| Entity ID (Vanta HG LLC) | `1a267bae-6772-4a76-bd98-51f5086cb4b3` — discovered, not yet stored in secret. |
| Existing accounts in Vanta HG LLC | Operating Account (8841) = `20bfdb1e-ac74-4eb1-b8cb-3a6e007bbf52` and IP Fees Account (2472) = `ec2d0820-1cb9-4e4b-a30b-240f2f0b467d`. **NEITHER will be used for VantaUM.** Recorded here only so a fresh thread doesn't waste time discovering them. |
| Secret vault slots | Three empty fields ready: `meow_entity_id`, `meow_collection_account_id`, `meow_vantaum_product_id`. |
| Code: `payment_method_types` in `lib/billing/invoice-generator.ts:280` | Already `['BANK_TRANSFER']` (verified 2026-05-13 — STATE.md called this a "trivial 1-line edit" but the code is already correct). **Skip this step**; verify the line still reads `payment_method_types: ['BANK_TRANSFER']` before resume but don't expect to edit. |

---

## Pre-flight — before doing anything else

Jonah confirms the new VantaUM Meow account exists. Without that, every
step below blocks.

```
Required from Jonah:
- Confirmation that the "VantaUM" account is provisioned in Meow
- Account is either a sub-account of Vanta HG LLC (entity_id
  1a267bae-...) or its own entity (in which case the entity_id below
  changes — see Step 1 caveat)
```

---

## Step 1 — Discover the new VantaUM account UUID

Start a Bastion shell via SSM (don't try this from the local laptop
— the laptop's IP is not on the Meow allowlist; will 403 instantly):

```bash
aws ssm start-session \
  --target i-0ac7f36a48ac8aacc \
  --profile vantaum --region us-east-1
```

Inside the bastion session:

```bash
# Pull the API key from Secrets Manager.
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id vantaum-prod-third-party-keys \
  --region us-east-1 \
  --query SecretString --output text)
MEOW_KEY=$(echo "$SECRET" | jq -r .meow_api_key)

# List accessible entities. Confirm the entity_id matches what we
# already have stored.
curl -s -H "x-api-key: $MEOW_KEY" \
  https://api.meow.com/v1/api-keys/accessible-entities | jq

# List accounts. Look for the new one named/nicknamed "VantaUM".
curl -s -H "x-api-key: $MEOW_KEY" \
  https://api.meow.com/v1/accounts | jq
```

**CRITICAL: never add `-v`, `--trace`, or `--trace-ascii` to those
curl commands.** Verbose mode prints request headers to stdout,
which leaks the API key. The first Meow key (22 chars, last4 `O0jA`)
was leaked this way and had to be revoked. Use plain `-s` only.

**Expected:** the accounts list includes one with a name or nickname
containing "VantaUM". Note its `id` UUID.

**If it returns a 403:** check the IP allowlist on the Meow API key.
Meow returns 403 (NOT 401) for IP-blocked requests regardless of key
validity. If a known-good key suddenly 403s, suspect the allowlist
before assuming the key was rotated. The bastion's egress IP should
be `3.81.192.170` — confirm with `curl -s ifconfig.me` on the bastion.

**If the VantaUM account is under a different entity** (Jonah set it
up as its own entity rather than a sub-account of Vanta HG LLC), the
`meow_entity_id` value in Step 2 changes. Re-run
`accessible-entities` to get the new entity UUID.

Record:
- `meow_entity_id` = `1a267bae-6772-4a76-bd98-51f5086cb4b3` (or the
  new value if VantaUM is its own entity)
- `meow_collection_account_id` = `<new VantaUM account UUID>`

Exit the bastion session.

---

## Step 2 — Write entity_id + collection_account_id into the secret

**Do NOT use the AWS Console plaintext JSON editor for this secret.**
The Console appends duplicate keys instead of replacing them — a
prior session ended up with two `meow_api_key` entries because of
this. Use the CLI:

```bash
# From the bastion or any host with the vantaum profile + jq + python3.

# Pull current secret to a tmp file.
aws secretsmanager get-secret-value \
  --profile vantaum --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys \
  --query SecretString --output text > /tmp/cur.json

# Patch in the new keys. Replace <NEW_VANTAUM_UUID> with the value
# from Step 1.
python3 -c "
import json
d = json.load(open('/tmp/cur.json'))
d['meow_entity_id'] = '1a267bae-6772-4a76-bd98-51f5086cb4b3'
d['meow_collection_account_id'] = '<NEW_VANTAUM_UUID>'
print(json.dumps(d))
" > /tmp/new.json

# Push the updated secret.
aws secretsmanager put-secret-value \
  --profile vantaum --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys \
  --secret-string file:///tmp/new.json

# Always clean up the tmp files — they contain the live API key.
rm /tmp/cur.json /tmp/new.json
```

Verify:

```bash
aws secretsmanager get-secret-value \
  --profile vantaum --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys \
  --query SecretString --output text \
  | jq '{meow_entity_id, meow_collection_account_id, meow_vantaum_product_id}'
```

Expect: `meow_entity_id` and `meow_collection_account_id` are now
filled. `meow_vantaum_product_id` is still empty — that's Step 4.

---

## Step 3 — Verify `lib/billing/invoice-generator.ts` is `['BANK_TRANSFER']`

STATE.md flags a "trivial 1-line edit" here, but verification on
2026-05-13 shows the line is already correct:

```bash
grep -n "payment_method_types" lib/billing/invoice-generator.ts
# Expect: line 280: payment_method_types: ['BANK_TRANSFER'],
```

If the line still reads `['BANK_TRANSFER', 'ACH_DIRECT_DEBIT']`, edit
it to `['BANK_TRANSFER']` only. The Meow API will 4xx on
`ACH_DIRECT_DEBIT` because that payment method is not enabled on this
account.

**If you edit:** add a commit on a feature branch (NOT the review
branch this doc lives on, and NOT main directly). Run the meow-client
tests to confirm nothing else regressed.

---

## Step 4 — Bootstrap the Meow Product

The Meow Product UUID is a singleton — one "VantaUM PEPM" Product per
account. `scripts/bootstrap-meow-product.ts` does an idempotency
check and refuses to run if `MEOW_VANTAUM_PRODUCT_ID` is already set.

Run from the bastion (so it inherits the allowlisted egress IP):

```bash
# Bastion SSM session again.
aws ssm start-session \
  --target i-0ac7f36a48ac8aacc \
  --profile vantaum --region us-east-1
```

The script needs Node.js + the repo. Bastion is bare Amazon Linux —
it doesn't have Node. Easiest path: SCP the compiled script up, or
run the equivalent curl directly.

**Equivalent curl (skips needing Node on the bastion):**

```bash
# Inside bastion. Use the same secret-pull pattern as Step 1.
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id vantaum-prod-third-party-keys \
  --region us-east-1 \
  --query SecretString --output text)
MEOW_KEY=$(echo "$SECRET" | jq -r .meow_api_key)
ENTITY_ID=$(echo "$SECRET" | jq -r .meow_entity_id)

# Create the Product. Adjust name/description as Jonah prefers.
curl -s -X POST \
  -H "x-api-key: $MEOW_KEY" \
  -H "Content-Type: application/json" \
  https://api.meow.com/v1/billing/products \
  -d "$(cat <<EOF
{
  "entity_id": "$ENTITY_ID",
  "name": "VantaUM PEPM",
  "description": "Per-employee-per-month utilization review service fee"
}
EOF
)" | jq
```

**Expected output:** JSON with `id`: `<product_uuid>`. Save the UUID.

**If output includes `error: 'duplicate_product'`** or similar — a
Product was already created in a prior attempt. List products to find
its UUID:

```bash
curl -s -H "x-api-key: $MEOW_KEY" \
  "https://api.meow.com/v1/billing/products?entity_id=$ENTITY_ID" | jq
```

Use that UUID instead.

Write the product UUID into the secret using the same put-secret-value
pattern from Step 2:

```bash
# (Still on bastion.)
aws secretsmanager get-secret-value \
  --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys \
  --query SecretString --output text > /tmp/cur.json

python3 -c "
import json
d = json.load(open('/tmp/cur.json'))
d['meow_vantaum_product_id'] = '<NEW_PRODUCT_UUID>'
print(json.dumps(d))
" > /tmp/new.json

aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id vantaum-prod-third-party-keys \
  --secret-string file:///tmp/new.json

rm /tmp/cur.json /tmp/new.json
```

Exit bastion.

---

## Step 5 — Wire the env vars into the Fargate task definition

Edit `infra-aws/lib/compute-stack.ts` to add four Meow env vars to
the app container. Pattern: existing `HELLOSIGN_API_KEY` wiring at
lines 191–192.

```diff
       secrets: usePlaceholder
         ? undefined
         : {
             // ... existing DB + Supabase + Anthropic + HelloSign ...
             HELLOSIGN_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'hellosign_api_key'),
             HELLOSIGN_CLIENT_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'hellosign_client_id'),
+            // Meow billing (PEPM invoice push + status sync).
+            MEOW_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_api_key'),
+            MEOW_ENTITY_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_entity_id'),
+            MEOW_COLLECTION_ACCOUNT_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_collection_account_id'),
+            MEOW_VANTAUM_PRODUCT_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_vantaum_product_id'),
             // ... rest unchanged ...
           },
```

Also add to the plain `environment` block (line 157–173):

```diff
       environment: {
         NODE_ENV: 'production',
         PORT: String(containerPort),
         ENABLE_AWS_STORAGE: 'true',
         ENABLE_AWS_AUTH: 'true',
         ENABLE_AWS_EMAIL: 'true',
         ENABLE_REAL_ANTHROPIC: 'true',
         ENABLE_REAL_HELLOSIGN: 'true',
         ENABLE_REAL_EFAX: 'true',
+        ENABLE_REAL_MEOW: 'true',
         NEXT_PUBLIC_SITE_URL: 'https://app.vantaum.com',
         APP_URL: 'https://app.vantaum.com',
         SES_FROM_ADDRESS: 'noreply@vantaum.com',
         AWS_REGION: this.region,
       },
```

Note: also add `MEOW_API_KEY` etc to the `secretObjectValue` initial
declaration around line 125–139 if they're not there — otherwise CDK
will error that the keys don't exist on the secret. (The slots
already exist per STATE.md line 467 — verify before deploy.)

Commit on a feature branch.

---

## Step 6 — Deploy + restart

```bash
cd ~/vantahg-brief-engine/infra-aws
AWS_PROFILE=vantaum \
  ./node_modules/.bin/cdk deploy vantaum-prod-compute \
  --require-approval never

aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1
```

Wait for the deployment to reach `runningCount: 1` on the new task
definition.

---

## Step 7 — Smoke test

**Prerequisite:** a test client row exists with `contact_email` set.
Without `contact_email`, the Meow customer creation 4xx's.

1. Open `https://app.vantaum.com/admin/invoices`
2. Click "Generate invoice" on a test client
3. Expected response:
   - Local row inserted with non-null `meow_invoice_id` and
     `meow_payment_url`
   - UI "Meow" column shows the live Meow status and a "Pay link →"
     URL
4. Open the Meow dashboard for the VantaUM account → Invoices
5. Confirm the invoice appears with the expected `total`,
   `customer_email`, and `payment_method_types: [BANK_TRANSFER]`

**If invoice push fails:** `pushInvoiceToMeow()` errors are
non-fatal — local row stays as draft with `meow_error` populated. Hit
the admin retry endpoint (if it exists yet — STATE.md hints at a
future `/api/admin/invoices/[id]/push-to-meow`) or call
`pushInvoiceToMeow()` manually from a one-off script.

**If `403 Forbidden` from Meow during smoke test:** verify the
Fargate task is actually egressing via `3.81.192.170`. Could be a NAT
gateway change or a new subnet egress route. Check the Fargate task
network mode in CDK.

---

## Step 8 — Verify cron sync

The status-sync cron at `GET /api/cron/meow-invoice-sync` runs every
30 minutes (Vercel cron in dev, EventBridge → Lambda → ALB in AWS).
After Step 7, the invoice should be in `DRAFT` or `OPEN` state on
Meow.

Wait 30 minutes, then check:

```sql
-- Run from bastion via psql against RDS.
SELECT id, meow_invoice_id, meow_status, status, paid_at, voided_at,
       meow_last_synced_at
FROM invoices
WHERE meow_invoice_id IS NOT NULL
ORDER BY meow_last_synced_at DESC NULLS LAST
LIMIT 5;
```

Expect: `meow_last_synced_at` updated to within the last 30 minutes.

---

## Step 9 — Update STATE.md

Move the Meow section in STATE.md "ACTIVE TASKS RIGHT NOW" from
PAUSED to RESOLVED. Record:
- Date resumed
- VantaUM account UUID
- Product UUID
- First test invoice ID

---

## Things you must not do (consolidated from STATE.md lessons)

- **Never use `curl -v` or `--trace` with the Meow key in a header.**
  Verbose mode prints headers to stdout = key leaked = key revoked.
  The first Meow key was lost this way.
- **Never edit `vantaum-prod-third-party-keys` via the AWS Console
  plaintext JSON editor.** It appends duplicate keys instead of
  replacing. Always use `aws secretsmanager put-secret-value` with a
  file payload.
- **Don't run Meow API calls from your laptop.** Your laptop IP is
  not on the Meow allowlist; you'll 403 every time. Use the bastion.
- **Don't regenerate the API key without a reason.** The current key
  (43 chars, last4 `Tv5s`) is on the IP allowlist and has 8 scopes
  verified. A new key means redoing the allowlist + scope setup.
- **Don't route VantaUM invoices to Operating (8841) or IP Fees
  (2472) accounts.** Jonah's explicit decision — those are
  Vanta HG LLC accounts, not VantaUM accounts.

---

## Diagnostic: "the API key suddenly stopped working"

| Symptom | Likely cause | Check |
|---|---|---|
| `403 Forbidden` | IP allowlist mismatch | `curl -s ifconfig.me` on the bastion — should be `3.81.192.170`. If different, the NAT EIP changed. |
| `403 Forbidden` | Key rotated | Check Meow UI → API Keys for the key with last4 `Tv5s`. If absent or marked revoked, generate a new one. |
| `401 Unauthorized` | Header name wrong | Meow uses `x-api-key`, NOT `Authorization: Bearer`. |
| Empty response from `accounts` | Entity doesn't have accounts | Did Jonah actually provision the VantaUM account? Check the Meow UI. |

---

## Where the entity_id came from

`1a267bae-6772-4a76-bd98-51f5086cb4b3` was discovered by calling
`GET /v1/api-keys/accessible-entities` with the working API key. The
response returns the list of entities the key has access to; for the
"VantaUM" key on the Vanta HG LLC entity, this UUID is the entity ID.

If the new VantaUM account is provisioned as its own separate Meow
entity (not a sub-account of Vanta HG), this UUID changes. Re-run
`accessible-entities` after Jonah confirms the structure.

# eFax Intake Setup

This doc covers setting up the production eFax pipeline for VantaUM. Audience: operators deploying VantaUM for a real customer who are comfortable with Vercel and Supabase but need the eFax-specific steps spelled out.

End-to-end flow: Phaxio receives a fax → webhook hits VantaUM → raw payload stored in `efax_queue` → cron worker downloads media, OCRs, extracts, and creates a case → the case lands in the physician review cockpit alongside the existing brief generation pipeline.

## Architecture at a glance

```
   +---------+      +-------------------------+      +-------------+
   | Phaxio  | ---> | /api/intake/efax/phaxio | ---> | efax_queue  |
   +---------+      +-------------------------+      | status=     |
        ^                       |                    | received    |
        |                       | 200 OK (async)     +------+------+
        |                                                   |
        |                                                   v
        |                                 +-----------------------------------+
        |                                 | /api/cron/efax-process (1/min)    |
        |                                 |  - fetch media (Phaxio Basic auth)|
        |                                 |  - store in Supabase Storage      |
        |                                 |  - OCR via Google Vision          |
        |                                 |  - extract via Claude             |
        |                                 |  - dedup by fingerprint           |
        |                                 +-----------------+-----------------+
        |                                                   |
        |                                                   v
        |                                    +---------------------------+
        |                                    | cases -> brief generation |
        |                                    | (existing pipeline)       |
        |                                    +---------------------------+
```

Callouts:

- The webhook **returns 200 immediately** — all real work happens in the cron worker.
- All processing is **idempotent**; retries are safe.
- **Fingerprint dedup** prevents double cases within a 24h window.
- Failed rows are retried up to 5 times, then parked in `status=dead_letter`.

## Prerequisites

- **Vercel Pro plan** — Hobby caps crons at daily; this pipeline needs minute-level.
- Supabase project with a service role key.
- Phaxio account (https://www.phaxio.com — Sinch acquired them but the API is unchanged).
- Google Cloud project with the Vision API enabled.
- Anthropic API key (already in use for brief generation).

## Step 1 — Run migration 008

Run `supabase/migrations/008_efax_pipeline.sql` either through the Supabase SQL editor or with:

```bash
supabase db push
```

The migration is additive and idempotent — it uses `IF NOT EXISTS` everywhere, so re-running it against an existing database is safe. It adds the `efax_queue` table, the fingerprint/status columns on `cases`, and the supporting indexes.

## Step 2 — Create the Supabase Storage bucket

In the Supabase dashboard:

1. **Storage → New bucket**
2. Name: `efax-documents`
3. Public: **OFF** (private — signed URLs only)
4. File size limit: `25 MB` (faxes larger than 25 MB are exceptional; flag for manual intake)
5. Allowed MIME types: `application/pdf,image/tiff,image/jpeg,image/png`

The cron worker writes to this bucket using the **service role key**, which bypasses RLS by design. Leave the default RLS on `storage.objects` alone.

## Step 3 — Set up Google Cloud Vision

1. Open https://console.cloud.google.com/apis/library/vision.googleapis.com and **Enable** the Vision API.
2. **APIs & Services → Credentials → Create credentials → API key**.
3. Restrict the key: **Credentials → edit key → API restrictions → Vision API only**.
4. Copy the key — you'll paste it into Vercel as `GOOGLE_VISION_API_KEY`.

**Expected cost**: at ~41,625 auths/month and ~1 page per fax, Document Text Detection runs roughly **$62/month** at $1.50 per 1,000 pages. The first 1,000 units/month are free.

## Step 4 — Set up Phaxio

1. Sign up at https://www.phaxio.com.
2. **Phaxio → Numbers → Buy a Number**. Note the number you buy.
3. Configure the receive callback:
   - **Phaxio → Account → API → Callback URL**
   - Set to: `https://<your-vercel-domain>/api/intake/efax/phaxio`
   - **Callback token**: generate a random 32-character string and save it — this becomes `PHAXIO_CALLBACK_TOKEN`.
4. Grab your API key and secret from **Phaxio → Account → API**. These become `PHAXIO_API_KEY` and `PHAXIO_API_SECRET` and are used as HTTP Basic auth when the cron worker downloads fax media.
5. Send a test fax to your Phaxio number to confirm the webhook arrives. Phaxio supports `is_test=true` for free test faxes during setup — use it liberally.

## Step 5 — Environment variables

All of these go into **Vercel → Settings → Environment Variables** for the Production environment.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (bucket writes, cron worker) |
| `ANTHROPIC_API_KEY` | yes | Claude for AI extraction |
| `PHAXIO_CALLBACK_TOKEN` | yes | HMAC verification on inbound webhooks |
| `PHAXIO_API_KEY` | yes | HTTP Basic auth for downloading fax media |
| `PHAXIO_API_SECRET` | yes | HTTP Basic auth for downloading fax media |
| `GOOGLE_VISION_API_KEY` | yes | Google Vision Document Text Detection |
| `EFAX_OCR_PROVIDER` | no | Override OCR adapter (`google_vision`, `provider`, `none`, `demo`). Default: auto-select. |
| `CRON_SECRET` | yes | Bearer token on the cron endpoint to block public access |

## Step 6 — Set CRON_SECRET

Generate a random secret and add it to Vercel env vars as `CRON_SECRET`. Vercel automatically forwards it in the `Authorization` header when invoking cron paths, and the endpoint rejects any other caller.

```bash
openssl rand -hex 32
```

## Step 7 — Deploy and verify

1. Deploy to Vercel.
2. Check **Vercel → Observability → Crons** — both `/api/cron/sla-check` (every 15 min) and `/api/cron/efax-process` (every minute) should appear.
3. Send a test fax to your Phaxio number.
4. Wait 60 seconds.
5. Open **Supabase → Table Editor → efax_queue**. You should see a row progressing through statuses: `received → fetching → ocr_processing → extracting → parsed → case_created` (or `manual_review` if confidence is low).
6. Check **Supabase Storage → efax-documents**. The stored PDF should be there.
7. Open **VantaUM → Dashboard → Cases**. The new case should appear in intake.

## Troubleshooting

- **Webhook returns 401** — `PHAXIO_CALLBACK_TOKEN` mismatch between Phaxio and Vercel. Regenerate and re-save on both sides.
- **`efax_queue` rows stuck at `status=received`** — cron worker isn't running. Check **Vercel → Observability → Crons** for errors, and confirm you're on Vercel Pro.
- **OCR confidence always 0** — `GOOGLE_VISION_API_KEY` is missing or the Vision API is not enabled in your Google Cloud project.
- **Cases have null `patient_name`** — the AI extractor fell back to regex mode because `ANTHROPIC_API_KEY` is missing or rate-limited. Check the `extraction_method` column on `efax_queue`.
- **Duplicate cases created** — `submission_fingerprint` was null because not enough patient data was extracted. This is expected: dedup requires identifiable fields.
- **`status=dead_letter`** — check the `last_error` column. After 5 failed attempts a row is parked. Reset with:

  ```sql
  UPDATE efax_queue
     SET status='received', attempts=0, last_error=NULL, next_attempt_at=NULL
   WHERE id = '...';
  ```

## Operational runbook

- **Daily**: monitor `efax_queue` status distribution.
- **Alert** on any `dead_letter` rows.
- **Alert** on cases with `needs_manual_review=true` aging past SLA (the `/api/cron/sla-check` job handles this, but make sure the downstream alerting is wired up).
- **Weekly**: review the `manual_review_reasons` distribution to identify systemic OCR failures.
- **Monthly**: audit Google Vision cost against auth volume.

## Appendix: Testing locally without Phaxio

1. Set `NEXT_PUBLIC_DEMO_MODE=true` (or simply omit the Supabase env vars).
2. POST sample payloads to `/api/intake/efax/phaxio` — demo mode returns canned extractions without hitting any external APIs.
3. The `efax_queue` GET endpoint returns 3 realistic demo rows so the cockpit UI has something to render.

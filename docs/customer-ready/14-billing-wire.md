# 14 — Billing wire (Cole)

How to run synthetic billing off the locked Sep 23 card. No live PHI. Do not edit dollar amounts in `lib/billing/um-price-card.ts`. The memo is [`pricing-strategy-memo-2026-09-23.md`](pricing-strategy-memo-2026-09-23.md). The rule index is [`um-pricing-rules.md`](um-pricing-rules.md).

Packaging is unchanged: VantaUM sells Med Review. VantaHG is IRO + IDR only. Optum stays frozen.

## What posts

| Line | When | Amount |
|---|---|---|
| `um_review` | Final route, or MD sign | auto **$0**, nurse **$85**, MD **$200**, external **$350**. R16 step-down if you pass `trailing_auto_rate`. Gold-card is **$0** and not billable. One row; the touch stack is kept. |
| `um_platform` | Lives-in-month supplied for that month | **$1.50 PMPM × lives-in-month**. Not $0 unless you set an explicit fat-TPA waiver. |
| `prior_auth` / `first_level_appeal` / `rush_addon` | Synthetic go-live client only, on MD sign | $45 / $75 / $25. The statement **drops** these when that case already has `um_review`. |

Planning denominators stay labeled and are not the statement census: broker **PEPM = 333k EE**, CFO **PMPM = 500k lives**, inbound **750k**.

## 1. Mint a review line

Route the case (auto does not require a signature; there is still no silent auto-approve):

```bash
curl -s -X POST "http://localhost:3000/api/case-spine/$CASE_ID/review-route" \
  -H 'content-type: application/json' \
  -d '{"touch":"nurse","trailing_auto_rate":0.55}'
```

`touch` is `auto`, `nurse`, `md`, or `external`. Add `"gold_card": true` for a $0 gold-card row. Pass `trailing_auto_rate` as a fraction (0.72 → nurse $70, MD $175, external $315). Omit it and the service uses the trailing 90 days of cases already on the spine.

MD sign (`POST /api/case-spine/$CASE_ID/sign`) posts or updates the same `um_review` row. A nurse case that an MD then signs becomes one MD line, not nurse plus MD.

## 2. Mint the platform line

Lives-in-month is something you type. It is not 500,000.

The synthetic fixture already carries a staging census you can change before publish:

- `lives_in_month`: **1200**
- `employees_in_month`: **800**
- `platform_fee_waived`: **false**

File: `docs/customer-ready/fixtures/client-config-synthetic.json`. Publish it the same way as the rest of onboarding (`POST /api/client-config` with that JSON, or “Publish synthetic client_config” on `/admin/onboarding`).

Or pass the census on the monthly job without republishing config. This job refuses every client except the synthetic staging id:

```bash
curl -s "http://localhost:3000/api/cron/monthly-statement?as_of=2026-09-18T12:00:00.000Z&lives_in_month=1200&employees_in_month=800"
```

Demo mode does not need `CRON_SECRET`. A real deploy still does.

Waiver, only when a contract actually waives the platform inside a fat TPA admin PEPM:

```bash
curl -s "http://localhost:3000/api/cron/monthly-statement?lives_in_month=1200&platform_waived=true"
```

`platform_fee_waived: true` on `client_config` is the same switch. Leaving it off keeps **$1.50**. Med Review does not zero the platform by itself. If you omit lives-in-month, the job does **not** invent a $0 platform row.

`POST /api/billing/statements` accepts the same three fields (`lives_in_month`, `employees_in_month`, `platform_waived`) and reads them from the published config when the body omits them.

With `ENABLE_AWS_DB=true`, those rows land in `billable_events` (migrations 030 and 032). With the flag off, they stay in the process memory ledger.

## 3. Read the statement

- Portal: `/portal/tpa/statements` → Generate this month. Platform block, then clinical rows by tier. $0 auto and gold-card stay on the page.
- HTML: `GET /api/billing/statements/{id}?format=html`
- PDF: `GET /api/billing/statements/{id}?format=pdf`

The denominator line says which lives and employees **this** statement used, and it says the 333k / 500k figures are the planning lock, not this invoice.

## 4. Read the scoreboard

`/admin/ops` and `GET /api/ops/scoreboard` expose `um_pricing`:

- **Planning** tiles use the locked denominators (750k inbound, 333k EE, 500k lives). First-pass stays an em dash.
- **Book** tiles are the cases actually on the spine (route mix and review contribution). Voids and duplicates are out.

Clients still get 403 on that route.

## Do not

- Change the card dollars.
- Bill platform and a review fee as if they were the same line, or blend PEPM and PMPM into one unlabeled rate.
- Add the legacy $45 schedule on top of `um_review`.
- Put live PHI in this ledger, the statement, or this note.

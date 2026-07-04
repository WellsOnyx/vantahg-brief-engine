# VantaTR Scenario Studio

A premium, single-screen interactive demo — a **benefits-strategy modeling dashboard** built for a Chief HR Officer or Total Rewards leader to play with live during a screen-share. In five minutes of clicking, an executive feels what it's like to redesign a benefits program and watch savings fund richer rewards in real time.

Runs **entirely on hardcoded sample data**. No backend, no database, no login, no API calls, no persistence — in-memory state only.

## The demo

A fictional employer, **Meridian National Group** (340,000 employees, $52,000 avg salary, $9,800 benefits spend/employee/yr, 68% participation), shown as an editable **Company Profile** you can adjust live.

Three zones on one screen:

1. **Design Levers** (left) — sliders for pre-tax participation, tax-advantaged architecture adoption, plan mix (traditional ↔ self/level-funded), and reinvestment rate, plus optional enrichment toggles (enhanced mental health, family building, student loan support).
2. **Live Outcomes** (center) — an animated headline savings number, payroll-tax (FICA) savings, plan-mix savings, rewards-reinvestment dollars, and a Current-vs-Redesigned program-cost chart showing where freed dollars go.
3. **Scenarios** (right) — Conservative / Balanced / Aggressive presets that snap the levers, plus **Save scenario** to keep up to three side-by-side comparison cards (in memory only).

Every math assumption is visible in an **Assumptions** drawer.

## Honesty guarantees (hard-coded)

- Permanent footer: *"Illustrative modeling on sample data. Actual results depend on plan design, carrier terms, and workforce composition. Not a quote."*
- No use of "guaranteed," "instant quote," or any real company/partner/client name.
- All assumptions surfaced in-app.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Deploy to Vercel

This app lives in the `vantatr-scenario-studio/` subdirectory of the repo. When importing to Vercel, set **Root Directory** to `vantatr-scenario-studio`. Framework preset auto-detects as Next.js; no environment variables are required.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4. Fonts: Spectral (serif display) + Inter (body). Palette: navy `#183b6d`, gold `#dba63f`.

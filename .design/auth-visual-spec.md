# VantaUM Auth — Visual Design Spec

Scope: `/login`, `/signup`, magic-link "check your email" state, and the `View My Cases` entry. Tokens from `app/globals.css` and `components/EmptyState.tsx` doctrine.

## 1. Page composition — Sign-in

A full-bleed **split** layout, not a centered SaaS card.

- **Left rail (60% on lg, full-width band on mobile)**: solid `bg-navy` (`#0c2340`), edge-to-edge, no gradient noise. A single oversized serif **"V"** sits in the lower-left, `text-[clamp(20rem,38vw,34rem)]`, `text-gold`, `opacity: 0.06`, `leading-none`, rotated `-4deg`, absolutely positioned and clipped by `overflow-hidden`. Above it, vertically centered with `pl-16 lg:pl-24`, sits the hero moment (§2).
- **Right rail (40% on lg)**: `bg-background` (`#f8f9fb`). The form lives here, **NOT in a card** — no rounded surface, no shadow, no border. Just typography on cream. Vertically centered. `max-w-sm`. This is the "private bank" tell: the form is part of the page, not floating on it.
- **No app nav, no marketing nav.** A thin top-left wordmark only: `VantaUM` in DM Serif Display at `text-lg`, `text-white` over navy. Top-right: a single `text-xs text-muted` line over cream: `Need access? Contact your concierge` with a gold-underline. Both `absolute top-8 left-8 / right-8 z-10`.
- **Vertical rhythm on the form column**: eyebrow (11px) → headline (40px serif) → 32px gap → form fields (16px between, 24px before submit) → 24px gap → magic-link toggle → 48px gap → footer micro-row (View My Cases · Return to wellsonyx.com).
- **Motion**: left-rail "V" fades in over 700ms with a 6px upward drift. The form column staggers: eyebrow, headline, fields, button at 60ms steps using existing `stagger-children` utility.

## 2. The hero moment

Left rail, vertically centered, layered over the watermark V:

- **Eyebrow** (gold, uppercase, tracking-wide): `Concierge Review` — `text-[11px] uppercase tracking-[0.22em] text-gold font-semibold`.
- **Serif tagline** (DM Serif Display, white): `text-4xl lg:text-5xl text-white leading-[1.15] max-w-md`. Copy: **"The room is quiet. Your work is waiting."**
- 48px-wide, 3px-tall `bg-gold-gradient` rule, 24px below the tagline.
- Below the rule: one line of sans body in `text-white/65 text-sm`: "Signed sessions for VantaUM reviewers, concierges, and partner clients."

## 3. Form treatment

- **Field style**: no card. Stacked label + input.
  - **Label**: `text-[11px] uppercase tracking-[0.14em] text-muted font-semibold mb-2`. Always above the field.
  - **Input**: underline-only — `w-full bg-transparent border-0 border-b border-border px-0 py-3 text-base text-foreground placeholder:text-muted/50 focus:border-gold focus:ring-0 focus:outline-none transition-colors`.
  - **Placeholder**: lowercase, ghostly — `you@health-plan.com`.
- **Primary CTA**: full-width, `bg-navy text-white py-3.5 rounded-md text-xs font-semibold uppercase tracking-[0.14em] hover:bg-navy-light transition shadow-[0_8px_24px_-12px_rgba(12,35,64,0.45)]`. Label: **Continue**. Magic-link mode: **Send link**.
- **Secondary action (magic-link toggle)**: single sans line below the CTA, centered, `text-sm text-navy/70`. `Prefer a magic link? <button class="text-gold-dark underline decoration-gold/30 underline-offset-4 hover:decoration-gold">Email me one instead.</button>` Reversible.

## 4. Sign-up page

Same split, same shell, three differences:

1. **Eyebrow** → `Request Access` (still gold uppercase).
2. **Tagline** → **"Tell us who you are. We'll prepare the room."** Body line: "VantaUM access is concierge-onboarded — your account is provisioned by a human within one business day."
3. **Fields**: Full name, Work email, Organization, Role (a quiet sans `<select>` styled identically). CTA **Request access**. Below: `Already onboarded? Sign in.`

**No password field on signup** — provisioning is concierge, not self-serve.

## 5. Magic-link "check your email" state

Replaces the form column entirely (left rail unchanged).

- 80px serif **"V"** centered, `text-gold` at `opacity: 0.15`.
- 32px below: serif headline (`text-3xl text-navy/85` DM Serif Display): **"Your link is on its way."**
- 12px below: `text-sm text-muted max-w-xs`: "We sent a one-time link to **jonah@wellsonyx.com**. It expires in 15 minutes."
- 32px below: `text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-navy` — **Use a different email**. Below it: `Didn't get it? Send again.` disabled 30s with faint `(30s)` countdown.

## 6. Error states

Inline above the relevant field, never a stacked alert, never red.

- **Treatment**: one line `text-xs text-navy font-medium mt-2 flex items-center gap-2` with `w-[3px] h-4 bg-gold inline-block` bar. Example: `▌ That email and password don't match our records.`
- **Field-level**: field underline shifts from `border-border` to `border-navy/40`.
- **Expired magic link**: full-page state, composition of §5, headline **"That link has rested."**
- **429 rate-limit**: serif headline **"One moment."**

## 7. Mobile

- Split collapses to **stacked**: navy hero becomes top band at `min-h-[40vh]`, form flows underneath on cream. Watermark V stays in navy band, sized to `text-[16rem]`.
- Form column: `px-6 py-12`. Serif headline drops to `text-3xl`.
- Magic-link confirmation: navy band shrinks to `min-h-[28vh]`.

## 8. Tailwind class reference

```
Page wrapper:
  min-h-screen grid lg:grid-cols-[60fr_40fr] bg-background

Left rail (navy hero):
  relative bg-navy overflow-hidden flex items-center px-8 lg:px-24 py-16 min-h-[40vh] lg:min-h-screen

Watermark V (absolute inside left rail):
  absolute -bottom-16 -left-8 font-[family-name:var(--font-display)]
  text-[clamp(20rem,38vw,34rem)] leading-none text-gold select-none
  pointer-events-none -rotate-[4deg]
  style={{ opacity: 0.06 }}

Eyebrow:
  text-[11px] uppercase tracking-[0.22em] text-gold font-semibold

Hero headline (serif on navy):
  font-[family-name:var(--font-display)] text-4xl lg:text-5xl text-white
  leading-[1.15] max-w-md mt-3

Gold rule:
  mt-6 h-[3px] w-12 bg-gold-gradient rounded-full

Right rail:
  flex items-center justify-center px-6 py-16 lg:py-24
Inner form container:
  w-full max-w-sm space-y-8

Field label:
  block text-[11px] uppercase tracking-[0.14em] text-muted font-semibold mb-2

Field input:
  w-full bg-transparent border-0 border-b border-border px-0 py-3
  text-base text-foreground placeholder:text-muted/50
  focus:border-gold focus:ring-0 focus:outline-none transition-colors

Primary CTA:
  w-full bg-navy text-white py-3.5 rounded-md text-xs font-semibold
  uppercase tracking-[0.14em] hover:bg-navy-light transition
  shadow-[0_8px_24px_-12px_rgba(12,35,64,0.45)] disabled:opacity-50

Secondary toggle line:
  text-sm text-navy/70 text-center
Inner gold link:
  text-gold-dark underline decoration-gold/30 underline-offset-4 hover:decoration-gold

Error marker row:
  text-xs text-navy font-medium mt-2 flex items-center gap-2
Marker bar:
  w-[3px] h-4 bg-gold inline-block

Wordmark top-left:
  absolute top-8 left-8 font-[family-name:var(--font-display)]
  text-lg text-white tracking-tight z-10
Concierge link top-right:
  absolute top-8 right-8 text-xs text-muted z-10
```

## ASCII — Sign-in composition

```
+------------------------------------------------+-----------------------------+
| VantaUM                                        |              Contact your   |
|                                                |                  concierge  |
|                                                |                             |
|   CONCIERGE REVIEW                             |   EMAIL                     |
|                                                |   ────────────────────────  |
|   The room is quiet.                           |   you@health-plan.com       |
|   Your work is waiting.                        |                             |
|   ▬▬▬                                          |   PASSWORD                  |
|   Signed sessions for VantaUM reviewers,       |   ────────────────────────  |
|   concierges, and partner clients.             |   ••••••••                  |
|                                                |                             |
|                                                |   [      CONTINUE       ]   |
|                                                |                             |
|                            V                   |   Prefer a magic link?      |
|                       (watermark, gold,        |   Email me one instead.     |
|                        6% opacity, clipped     |                             |
|                        bottom-left, rot -4°)   |   View My Cases  ·  Return  |
|                                                |   to wellsonyx.com          |
+------------------------------------------------+-----------------------------+
            navy 60%                                    cream 40%
```

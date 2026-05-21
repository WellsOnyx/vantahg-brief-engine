# VantaUM Auth Surfaces — UX Spec

Scope: `/login`, `/signup`, magic-link request/confirm/callback, member "View My Cases" entry. Marketing site untouched.

---

## 1. Nav-leak fix (P0 bug)

**Cause.** `app/layout.tsx:116` wraps every route in `<AppShell primaryNav={adminInternalNav} roleSurface="Admin">`. `AppShell` (`components/AppShell.tsx:54`) only suppresses chrome for the `CHROMELESS_PATHS` set: `/`, `/demo`, `/site`, `/signup-tpa`. `/login` and `/signup` are not in that set, so the navy top bar, sidebar (Mission Control / Operations / Clients / Billing / Setup), breadcrumb, and `TenantScopeSelector` all render around the logged-out form.

**Fix.** In `components/AppShell.tsx:54`, replace the path Set with a prefix matcher and add the auth surfaces:

```ts
const CHROMELESS_PREFIXES = ['/demo', '/site', '/signup-tpa', '/login', '/signup', '/auth', '/magic-link', '/forgot-password'];
const isChromeless = pathname === '/' || CHROMELESS_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
```

When `isChromeless`, render `<AuthShell>{children}</AuthShell>` (new) instead of bare `{children}` on auth routes; keep bare on `/`, `/demo`, `/site`, `/signup-tpa` (those have their own marketing chrome). `/client/cases` keeps full chrome — members authenticate, they just see a tighter nav.

**Do not** fix this at the page level with CSS. Cut at the layout boundary.

---

## 2. New primitive: `AuthShell` (add to `components/layouts/PageLayouts.tsx`)

```
<AuthShell>
  ├── full-bleed navy canvas (#0B1F3A), subtle radial gold @ 6% opacity top-left
  ├── top rail (64px, transparent over canvas)
  │     ├── V mark + "VantaUM" wordmark → links to wellsonyx.com (NOT "/")
  │     └── right: BackLink href="https://wellsonyx.com/firstlevelreview" label="Back to Wells Onyx"
  ├── centered slot (max-w-[420px], vertical center desktop, top-aligned mobile)
  │     └── {children}  // the AuthCard
  └── footer rail (48px, bottom)
        "A Wells Onyx Service" · gold dot · "© 2026" · "Privacy" · "Status"
        — 11px white/50, never wraps
```

Shape: `<AuthShell><AuthCard eyebrow title subtitle>{form}<AuthCard.Footer>{links}</AuthCard.Footer></AuthCard></AuthShell>`. No sidebar, no breadcrumb, no `TenantScopeSelector`, no `HeaderAuth`.

`AuthCard` is **not** a white box on a gray page (which is what `/login` is today). It is a translucent `bg-white/[0.04]` panel with `border-white/10`, `rounded-2xl`, `backdrop-blur-sm`, on the navy canvas. Inputs invert: white text on `bg-white/[0.06]`, gold focus ring. **This is the brand moment that is missing.**

---

## 3. `/login` IA

Vertical order, top to bottom:

1. **Eyebrow** (gold-dotted, 11px uppercase tracked): `Sign in`
2. **Headline** (DM Serif Display, 32px, white): `Welcome back.` — full stop, editorial, one line. Replaces `Sign in to your account`.
3. **Subhead** (14px, white/60): `Concierge utilization management for TPAs, health plans, and self-funded employers.` — trimmed on mobile to `Concierge utilization management.`
4. **Form** — email, password, primary CTA `Sign in` (`bg-gold text-navy` — the one place gold fills, per doctrine "mark not fill" except for the single primary action). Magic-link toggle as a quiet text link **above** the CTA, not below: `Email me a sign-in link instead` (gold-dark).
5. **Divider** — thin `border-white/10` with serif `or` centered (12px white/40).
6. **Three pathways** — stacked list, NOT three columns (scannable on mobile). Each row: editorial label + subtitle + chevron, `block py-3 border-t border-white/8`. Hover lifts label to gold.
   - `View My Cases` → `/client/cases` — eyebrow `Member access`, subtitle `Look up your authorization status with a member ID.`
   - `New TPA partner?` → `/signup-tpa` — eyebrow `Partner onboarding`, subtitle `Start a concierge agreement.`
   - `Create an account` → `/signup` — eyebrow `Staff account`, subtitle `For reviewers, attorneys, and concierge ops.`
7. **Footer link** lives in `AuthShell` footer, not the card: `Return to wellsonyx.com`.

The current page (`app/login/page.tsx:201-225`) mashes member access, signup, and the return link into a 10px-muted block at the bottom. That is the clutter. The three pathways must be **first-class** because three different people land here.

---

## 4. `/signup` IA

Single column, same `AuthCard` shell.

- Eyebrow: `Create account`
- Headline: `Join the bench.` (DM Serif)
- Subhead: `Staff sign-up. TPAs and health plans start at /signup-tpa.` — render `/signup-tpa` as a gold inline link so misdirected partners self-route in one click.
- Fields, in order: `Full name`, `Work email`, `Password (min 8)`, `Role` (Physician reviewer / Concierge ops / IDR attorney / Administrator). **Remove `Client (TPA / Health Plan)` from this dropdown** — that's `/signup-tpa`'s job; keeping it here creates a dead-end account.
- Primary CTA: `Create account` (gold-on-navy).
- Below CTA, 11px white/50: `By creating an account you agree to the Wells Onyx BAA and acceptable-use policy.`

**Post-signup landing.** Do not redirect to `/login`. Replace the form in-card with a success state: DM Serif headline `Check your inbox.`, subhead `We sent a confirmation link to <email>. Click it to finish setting up your account.`, 60s `Resend` countdown, `Wrong email?` link that resets the form. After they click the confirmation, land on `/welcome` (already exists), which routes by role.

---

## 5. Magic-link UX — three states, one canvas

**5a. Request.** Toggled from `/login` — card morphs in place, do NOT navigate. Headline shifts to `One-tap sign-in.`, subhead `Enter the email on your VantaUM account. We'll send a link.`, single email field, CTA `Send the link`. Password field animates out (200ms). `Use password instead` replaces the magic-link toggle.

**5b. Confirmation.** After successful POST to `/api/auth/request-magic-link`. Card content replaces:
- Eyebrow: `Sent`
- Headline (DM Serif): `Check <emaildomain>.` — substitute the literal domain (`Check gmail.com.`). This is the editorial moment.
- Subhead: `The link is good for 15 minutes and works on this device or any other.`
- Quiet 60s `Resend link` countdown, then enables.
- `Wrong email?` returns to request state.
- **No checkmark icon.** The serif sentence does the work.

**5c. Callback.** `/api/auth/callback` redirects straight to role landing — do not bounce through `/login`. If callback fails (expired/used), land on `/login?error=link_expired` rendering the error state below.

---

## 6. Empty / error states (brand moments)

All errors render inside `AuthCard` as a replacement for the form's top. No red banners, no toast popups. Format: dot + 11px uppercase tracked eyebrow + DM Serif sentence + plain-prose recovery.

- **Wrong password.** Eyebrow `Not quite.` Serif `That password didn't match.` Subhead `Try again, or email yourself a sign-in link.` (magic-link toggle inlined). Three attempts → surface `Reset password` as primary CTA.
- **Unknown email.** Eyebrow `New here?` Serif `We don't have an account for <email>.` Subhead `Create one, or check that you used your work address.` `Create account` becomes primary CTA.
- **Magic link expired.** Eyebrow `Expired.` Serif `That link timed out.` Subhead `Links last 15 minutes. We can send a fresh one.` CTA `Send a new link` — pre-fills email if available in query string.
- **Rate-limited (429).** Eyebrow `Slow down.` Serif `Too many tries.` Subhead `Wait 60 seconds and try again — we cap requests to protect member data.` Countdown in the CTA label.
- **Demo mode.** Eyebrow `Demo.` Serif `You're inside the showroom.` Subhead `Sign-in is bypassed. Pick a role to enter.` — three role chips.

Never red, never warning emoji. Errors keep the navy canvas; the only color shift is the dot — gold becomes coral (`#E07856`).

---

## 7. Mobile (375px baseline)

- `AuthShell` top-aligned (not vertically centered) with 48px top padding so the iOS keyboard doesn't push content off-screen.
- Top rail collapses: V mark only on left, `Back` text-link on right (no wordmark).
- `AuthCard` full-bleed minus 16px gutters, `rounded-xl`, same translucent treatment.
- Headline 26px (down from 32px). Subhead clips to one line via `line-clamp-1`.
- Three-pathway list stays stacked, row padding tightens to `py-2.5`.
- Inputs 48px min height, `text-base` (16px) to suppress iOS auto-zoom.
- Primary CTA sticky to viewport bottom while keyboard is open: `position: sticky; bottom: env(keyboard-inset-height, 0)`.
- Magic-link confirmation: `Open Mail app` button (deep link `message://`) on iOS; `Open Gmail` if email domain is gmail.com.
- Footer rail collapses to one line: `Wells Onyx · Privacy`.

---

## Implementation order

1. **Patch `CHROMELESS_PATHS` in `components/AppShell.tsx:54` to a prefix matcher and add `/login`, `/signup`, `/auth`, `/magic-link`, `/forgot-password`.** Ship this alone first — kills the leak.
2. Add `AuthShell` + `AuthCard` primitives to `components/layouts/PageLayouts.tsx`.
3. Rewrite `app/login/page.tsx` against section 3.
4. Rewrite `app/signup/page.tsx` (section 4) and add the in-card "check your inbox" state.
5. Build the three magic-link states as one state machine inside `app/login/page.tsx` (already toggle-based — extend, don't fork).
6. Wire error states by reading `?error=` from URL on `/login` mount (section 6).

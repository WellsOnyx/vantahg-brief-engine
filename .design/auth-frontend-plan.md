# Auth Frontend — Technical Audit + Implementation Plan

## 1. Nav-leak root cause

- `app/layout.tsx:100-123` wraps **every** child in `<AppShell primaryNav={adminInternalNav} roleSurface="Admin">`. `/login` is a child, so it inherits the full admin sidebar + top bar.
- `components/AppShell.tsx:54` has an opt-out set: `CHROMELESS_PATHS = new Set(['/', '/demo', '/site', '/signup-tpa'])`. `/login` and `/signup` are **not** in it — that's the immediate bug, atop the deeper architectural smell.
- `components/HeaderAuth.tsx:43-52` does render only "Sign in" when no user, but the Sidebar (with `adminInternalNav` — Mission Control, Operations, Clients, Billing, Setup) and TopBar still mount.

**Chosen fix: route-group split.** Carve out `app/(auth)/…` with its own minimal `layout.tsx` (renders `<AuthProvider>{children}</AuthProvider>` only — no AppShell). Authed pages stay under `RootLayout` (or move to `app/(app)/…`). Justification: (a) eliminates the recurring "did I add the path to `CHROMELESS_PATHS`" bug class; (b) Next 16 route groups don't change URLs; (c) keeps `app/portal/tpa/layout.tsx` untouched because nested layouts compose under whichever group they sit in.

Pathname-conditional rendering inside AppShell — rejected, leaves the bomb armed.

## 2. Current auth surface inventory

- `app/login/page.tsx` (247 lines) — sign-in card; password + magic-link toggle; role-routes via `resolveLandingPage` (lines 22-45). **Still says "VantaHG / First-Level Review Platform"** (lines 125, 129).
- `app/signup/page.tsx` (175 lines) — self-serve signup with role dropdown `admin | reviewer | client`. Calls `supabase.auth.signUp` directly from the browser. Same stale "VantaHG" brand (line 58). **No allow-list / invite gate** — flag for product.
- `app/signup-tpa/page.tsx` — public TPA prospect form → `/api/signup-tpa`. Already chromeless via AppShell line 54. Leave alone.
- `app/welcome/page.tsx` — marketing splash; NOT in `CHROMELESS_PATHS`, also leaks the nav (separate fix).
- `app/api/auth/request-magic-link/route.ts` — POST, zod `{email, next}`, calls `getAuthAdapter().createUserWithMagicLink`, opaque 202.
- `app/api/auth/callback/route.ts` — GET, redeems Cognito OTP, sets `vantaum_session` HttpOnly cookie, 302 to `next` (default `/dashboard`).
- `components/AuthProvider.tsx` — Supabase session context; mounted in RootLayout; MUST also mount in the `(auth)` layout.
- `components/HeaderAuth.tsx` — avatar/"Sign in" menu, lives in AppShell TopBar only.
- `app/client/cases/page.tsx` — "View My Cases" target.

**Dead/dup:** `app/page.old.tsx` is a stale snapshot (Next will silently route it as `/page.old`). Delete in cleanup PR. `/signup` is functional but unprotected — product decision needed.

## 3. Supabase auth data flow

Password (`app/login/page.tsx:101-111`):
```
form submit → supabase.auth.signInWithPassword({email, password})
            → @supabase/ssr sets sb-* cookies
            → window.location.href = explicitRedirect ?? resolveLandingPage(supabase)
              (user_profiles.role → /mission-control | /office-ceo | /builders | /client/cases | /cases)
```

Magic-link:
```
form → POST /api/auth/request-magic-link {email, next}
     → adapter.createUserWithMagicLink → Cognito or Supabase email
     → user clicks → GET /api/auth/callback?code&user&next
     → adapter.redeemMagicLink → set vantaum_session cookie
     → 302 to ?next= (default /dashboard)
```

Gate: `middleware.ts:107-119` — any non-public, non-API page with no `user` → 302 `/login?redirect=<original>`.

## 4. "View My Cases" target

- Link: `app/login/page.tsx:209-215` → `/client/cases`.
- File: `app/client/cases/page.tsx` (client-role list, reads Supabase direct).
- Auth gate: middleware only. `app/client/` has no layout/guard like `portal/tpa/` does — worth a follow-up audit, **out of scope** for this redesign.

## 5. Sign-up page

Exists at `app/signup/page.tsx`. Plan: move to `app/(auth)/sign-up/page.tsx` (rename slug to match UX agents' nomenclature) and add `/signup` → `/sign-up` redirect to preserve inbound links. Invite-only gate = separate ticket.

## 6. Proposed file structure

```
app/
  (auth)/
    layout.tsx                 NEW — <AuthProvider>{children}</AuthProvider>; no AppShell
    login/page.tsx             MOVED from app/login/page.tsx
    sign-up/page.tsx           MOVED + RENAMED from app/signup/page.tsx
    magic-link/page.tsx        NEW — "check your email" surface (promoted from inline banner)
    forgot-password/page.tsx   NEW — stub until reset API exists
  layout.tsx                   UNCHANGED structurally (still mounts AppShell);
                               the (auth) group's nested layout overrides for those routes
  signup/page.tsx              DELETE after redirect added
  login/page.tsx               DELETE after move
  api/auth/**                  UNCHANGED
middleware.ts:8                ADD '/sign-up', '/magic-link', '/forgot-password' to
                               PUBLIC_PAGE_PREFIXES BEFORE moving files (else lockout)
next.config.ts                 ADD redirects: { source: '/signup', destination: '/sign-up' }
```

**Recommended first PR (minimal-move variant):** only create `app/(auth)/layout.tsx` (no AppShell) and move `login` + `signup` under it. Verify in dev that the group-local layout fully replaces the inherited RootLayout AppShell wrapper. If Next 16 still composes the parent (it shouldn't — group layouts are absolute for their segment), fall back to the full `(app)`/`(auth)` split.

## 7. New primitive: `components/layouts/AuthShell.tsx`

```tsx
export interface AuthShellProps {
  eyebrow?: string;            // "Sign in" / "Welcome back"
  title: ReactNode;            // serif headline, ONE per screen
  subtitle?: ReactNode;
  footer?: ReactNode;          // "Don't have an account?" + Wells Onyx mark
  children: ReactNode;         // form / card body
  variant?: 'card' | 'split';  // 'split' = left brand panel + right form
}
```

- Wraps `components/SectionCard.tsx` for the card body so spacing/shadow match the rest of the app.
- Footer slot can host `components/EmptyState.tsx` (e.g. magic-link sent confirmation).
- Do **not** couple `components/MetricValue.tsx` — overkill for auth.
- Place at `components/layouts/AuthShell.tsx` next to `PageLayouts.tsx` so it's discoverable alongside `PageDashboard / PageFocused / PageList / PageSubmit`.

## 8. Risks

- **Middleware redirect chain**: `middleware.ts:111` preserves `?redirect=` — must add `/sign-up` to `PUBLIC_PAGE_PREFIXES` (line 8) **before** the file move, else locked-out users.
- **TPA portal layout** (`app/portal/tpa/layout.tsx:5`) calls `createBrowserClient` for sign-out — depends on `AuthProvider` being mounted above. Keep RootLayout's `<AuthProvider>` wrapper or duplicate it in `(app)/layout.tsx` if you do the full split.
- **Cookie coexistence**: Cognito sets `vantaum_session`, Supabase SSR sets `sb-*`. Both written by `/api/auth/callback` / Supabase SDK respectively. New pages must not clear either.
- **`/` (`app/page.tsx`)** is in `CHROMELESS_PATHS`. After the split, decide whether `/` belongs to `(auth)` (public) or `(app)` (authed marketing). Audit separately — out of scope.
- **`app/welcome/page.tsx`** also leaks nav today; flag for the same treatment in a follow-up.
- **No `proxy.ts`** in the repo (confirmed); `middleware.ts` is the only edge gate.
- **`app/page.old.tsx`** exists — Next will route it as `/page.old`. Delete in a cleanup PR.
- **Stale brand**: both pages say "VantaHG / First-Level Review Platform" — UX redesign must replace with "VantaUM".

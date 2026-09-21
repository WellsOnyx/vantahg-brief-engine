# Lint hydrate allowlist

**Status:** Intentional exceptions so `npm run lint` can stay fail-closed.  
**Does not change hydrate behavior.** New `react-hooks/set-state-in-effect` findings must be fixed or explicitly allowlisted.

PR #67 cleared the historic ~180-issue lint backlog. Five client-only hydrate sites still call `setState` inside `useEffect` because the values come from `document` / `location` / `localStorage` / a post-mount fetch. Autofixing them risks SSR/client mismatch. Each site has `eslint-disable-next-line react-hooks/set-state-in-effect` plus a short WHY.

| File | Why the effect stays |
|------|----------------------|
| `app/admin/signups/page.tsx` | Fetch-on-mount hydrates the admin queue after client mount (session unavailable during SSR). |
| `app/ops/page.tsx` | `localStorage` hydrate of lives + TPAs after mount so SSR HTML stays deterministic. |
| `app/ops/page.tsx` | Sync derived signed-lives into the lives input; doing this during render would loop. |
| `components/AppShell.tsx` | Demo-signal detect uses `document` / `location`, unavailable during SSR. |
| `lib/tenant-scope.tsx` | Hydrate selected tenant from `localStorage` after mount to avoid SSR/client mismatch. |

`npm run lint` is `eslint --max-warnings 0`. Any new lint error or warning fails CI. Do not expand this list without a WHY comment on the site itself.

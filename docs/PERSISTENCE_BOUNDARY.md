# Persistence Boundary — intake/API (consumer) ↔ lib/db (provider)

Cross-zone interface agreement. **Consumer:** intake/API routes (this agent's zone).
**Provider:** `lib/db/supabase-shim.ts` + `lib/supabase.ts` (Grok's zone). The shared
signal is the env flag `REQUIRE_REAL_PERSISTENCE`.

## The failure this closes
`isDemoMode()` = `!hasSupabaseConfig()`. If a real deployment is missing its DB env
vars, `isDemoMode()` silently returns true and intake routes take their demo branch —
accepting inbound intake and dropping it. At 333K/yr that is silent data loss.

## Consumer side — DONE (this agent)
- `lib/intake/persistence-guard.ts` → `intakePersistenceGuard()` returns **503** when
  `REQUIRE_REAL_PERSISTENCE === 'true' && isDemoMode()`.
- Wired into every intake writer:
  - `middleware.ts` for the public webhooks (`/api/external/submit`, `/api/intake/efax`,
    `/api/intake/email`, `/api/intake/voice`, `/api/intake/efax/phaxio`).
  - In-route for the non-public writers: `/api/gr/webhook`, `POST /api/cases`.
- Result: in the MVP/prod env, a missing DB fails **loud**, never silent-demo.

## Provider side — REQUESTED (Grok), defense-in-depth
So a future route that forgets the guard still cannot silently drop:

1. **`getServiceClient()` must throw, not stub.** When `REQUIRE_REAL_PERSISTENCE === 'true'`
   and real config is absent, it should throw a clear error rather than return a demo/no-op
   client. Today it may return a stub → silent no-op writes.
2. **`hasSupabaseConfig()` must reflect true readiness** on both paths — the Supabase path
   (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) and the AWS DB path
   (`ENABLE_AWS_DB` + `DATABASE_URL` | `DB_HOST`+`DB_PASSWORD`). It already checks both;
   keep it authoritative — it is the single source of truth the guard depends on.
3. **No silent no-op writes in the shim.** A write executed against an unconfigured client
   should surface an error, not resolve as success.

## Contract summary
| Concern | Owner | State |
|---|---|---|
| Refuse intake when real-but-unconfigured | intake/API | ✅ done (guard + wiring) |
| `getServiceClient()` throws instead of stubbing | lib/db (Grok) | ⛳ requested |
| `hasSupabaseConfig()` authoritative on both paths | lib/db (Grok) | ✅ already true; keep |
| Shim never silently no-ops a write | lib/db (Grok) | ⛳ requested |

Env flag `REQUIRE_REAL_PERSISTENCE=true` is set in the MVP/prod environment (secrets checklist).

# 2026-05-11 — vantaum.com cache-bust

Forces Vercel to rebuild `main` from a fresh state so it picks up the
removal of the `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY`
env vars that were temporarily set during First Mover setup.

No code changes. Pure ops marker.

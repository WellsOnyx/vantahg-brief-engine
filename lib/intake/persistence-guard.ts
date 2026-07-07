import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo-mode';

/**
 * Fail-closed guard for intake / persistence routes.
 *
 * The failure mode this closes: when a deployment is MEANT to run for real but
 * the database env vars are missing, `isDemoMode()` (= `!hasSupabaseConfig()`)
 * silently returns true and every intake route takes its demo branch — quietly
 * accepting inbound intake and dropping it on the floor (the "real signups
 * silently disappear" bug from STATE.md, at 333K/yr volume).
 *
 * `REQUIRE_REAL_PERSISTENCE=true` is set in the MVP / production environment.
 * When set, a demo state is treated as a broken deploy: intake is REFUSED with a
 * loud 503 rather than silently demo-dropped. Local dev leaves the flag unset,
 * so demo behavior is unchanged there.
 *
 * This mirrors the middleware's auth fail-closed: demo mode is the only
 * legitimate empty-config state, and it must be opted into explicitly.
 */
export function requiresRealPersistence(): boolean {
  return process.env.REQUIRE_REAL_PERSISTENCE === 'true';
}

/**
 * Returns a 503 response when real persistence is required but the database is
 * not configured (would otherwise silently demo-drop the intake). Returns null
 * when it is safe to proceed — either the real DB is wired, or this is a
 * dev/demo deployment that legitimately allows demo.
 *
 * Call at the top of every intake POST handler, before the demo branch:
 *
 *   const blocked = intakePersistenceGuard();
 *   if (blocked) return blocked;
 */
export function intakePersistenceGuard(): NextResponse | null {
  if (requiresRealPersistence() && isDemoMode()) {
    return NextResponse.json(
      {
        error: 'persistence_unavailable',
        detail:
          'Real persistence is required in this environment but the database is not configured. ' +
          'Intake is refused rather than silently dropped. Fix the Supabase/RDS env vars.',
      },
      { status: 503 },
    );
  }
  return null;
}

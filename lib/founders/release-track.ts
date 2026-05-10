/**
 * Founders Release feature flag.
 *
 * The Founders Release is a partitioned MVP that lives under `/founders/*`
 * and `lib/founders/*`. It runs on a separate Vercel project and (in
 * production) a separate Supabase project, so it ships fast without
 * blocking or being blocked by the main automated build.
 *
 * Sunset criteria — when main feature parity is reached on:
 *   1. AI extraction confidence >= 0.85 across all service types
 *   2. Eligibility green/red-dot lookup wired
 *   3. All 5 determination outcomes wired with provider-facing UI
 *
 * Sunset = delete `app/founders/` and `lib/founders/`, drop the Founders
 * Supabase project, retire the Vercel project.
 */

export type ReleaseTrack = 'founders' | 'main';

export function getReleaseTrack(): ReleaseTrack {
  return process.env.RELEASE_TRACK === 'founders' ? 'founders' : 'main';
}

export function isFoundersRelease(): boolean {
  return getReleaseTrack() === 'founders';
}

/**
 * True when /founders/* routes should be served. In production this requires
 * RELEASE_TRACK=founders so the main deploy never exposes the namespace.
 * In development we always allow it for local iteration.
 */
export function foundersRoutesEnabled(): boolean {
  return isFoundersRelease() || process.env.NODE_ENV === 'development';
}

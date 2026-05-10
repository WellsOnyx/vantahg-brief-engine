/**
 * First Mover feature flag.
 *
 * First Mover is a partitioned manual-first MVP that lives under
 * `/firstmover/*` and `lib/firstmover/*`. It ships on the main Vercel
 * deploy gated by RELEASE_TRACK=firstmover, so a single domain can
 * surface either main or First Mover routes without a separate deploy.
 *
 * Sunset criteria — when main feature parity is reached on:
 *   1. AI extraction confidence >= 0.85 across all service types
 *   2. Eligibility green/red-dot lookup wired
 *   3. All 5 determination outcomes wired with provider-facing UI
 *
 * Sunset = delete `app/firstmover/` and `lib/firstmover/`, drop the
 * First Mover-specific tables (member_eligibility, provider_orgs).
 */

export type ReleaseTrack = 'firstmover' | 'main';

export function getReleaseTrack(): ReleaseTrack {
  return process.env.RELEASE_TRACK === 'firstmover' ? 'firstmover' : 'main';
}

export function isFirstMoverRelease(): boolean {
  return getReleaseTrack() === 'firstmover';
}

/**
 * True when /firstmover/* routes should be served. In production this requires
 * RELEASE_TRACK=firstmover so the main deploy never exposes the namespace.
 * In development we always allow it for local iteration.
 */
export function firstmoverRoutesEnabled(): boolean {
  return isFirstMoverRelease() || process.env.NODE_ENV === 'development';
}

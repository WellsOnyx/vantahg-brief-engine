import type { AuthUser } from '@/lib/auth-guard';
import { isDemoMode } from '@/lib/demo-mode';
import { toSpineViewRole } from './rbac';
import type { SpineViewRole, SpineViewer } from './types';

/**
 * Demo / test role impersonation. Production never honors these headers —
 * viewer identity comes from the authenticated session only.
 *
 *   x-vantaum-role: client | concierge | reviewer | admin | …
 *   x-vantaum-client-id: tenant uuid (required for client lens)
 */
export const DEMO_ROLE_HEADER = 'x-vantaum-role';
export const DEMO_CLIENT_HEADER = 'x-vantaum-client-id';

export function allowDemoViewerOverride(): boolean {
  return isDemoMode() || process.env.NODE_ENV === 'test';
}

export function resolveSpineViewer(user: AuthUser, request?: Request): SpineViewer {
  const allow = allowDemoViewerOverride();
  const overrideRole = allow ? request?.headers.get(DEMO_ROLE_HEADER) : null;
  const overrideClient = allow ? request?.headers.get(DEMO_CLIENT_HEADER) : null;

  const role: SpineViewRole = toSpineViewRole(overrideRole || user.role);
  const client_id =
    overrideClient ||
    (typeof (user as AuthUser & { client_id?: string | null }).client_id === 'string'
      ? (user as AuthUser & { client_id?: string }).client_id
      : null) ||
    null;

  return {
    id: user.id,
    role,
    client_id: role === 'client' ? client_id : client_id,
  };
}

export function canAccessCxNotes(viewer: SpineViewer): boolean {
  return viewer.role === 'cx' || viewer.role === 'superadmin';
}

export function canAccessClinicalPacket(viewer: SpineViewer): boolean {
  return viewer.role === 'med_review' || viewer.role === 'superadmin';
}

export function canAccessClientView(viewer: SpineViewer): boolean {
  return viewer.role === 'client' || viewer.role === 'superadmin';
}

export function canAccessCxView(viewer: SpineViewer): boolean {
  return viewer.role === 'cx' || viewer.role === 'superadmin';
}

export function canAccessMedReviewView(viewer: SpineViewer): boolean {
  return viewer.role === 'med_review' || viewer.role === 'superadmin';
}

/** Audit / break-glass trail — not a client portal surface (04). */
export function canAccessCaseAudit(viewer: SpineViewer): boolean {
  return viewer.role === 'cx' || viewer.role === 'med_review' || viewer.role === 'superadmin';
}

/** Fan-out delivery after sign — CX resolve_fanout or Med deliver. */
export function canMutateFanout(viewer: SpineViewer): boolean {
  return canAccessCxView(viewer) || canAccessMedReviewView(viewer);
}

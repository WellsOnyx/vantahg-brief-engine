import { NextResponse } from 'next/server';
import { getAuthAdapter } from './adapters/auth';
import { getServiceClient } from './supabase';
import { logSecurityEvent } from './audit';
import { getRequestContext } from './security';
import { isDemoMode } from './demo-mode';

export type UserRole =
  | 'admin'
  | 'reviewer'
  | 'client'
  | 'builder'
  | 'ceo'
  | 'practice-lead'
  | 'slt'
  | 'delivery-lead'
  | 'concierge'
  | 'idr-attorney';   // External partner attorneys handling Payer IDR cases (Phase 2B)

/**
 * Roles considered "internal staff" — admin + organizational + exec views.
 * Distinct from 'client' (tenant users). Used for nav gating, case-access
 * decisions, and the new staff-management roster.
 */
export const INTERNAL_STAFF_ROLES: ReadonlyArray<UserRole> = [
  'admin', 'reviewer', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead', 'concierge',
];

/**
 * Roles that can act as external IDR Attorneys.
 * These users will primarily work in the dedicated /attorney/* surfaces
 * and should have limited access compared to internal clinical roles.
 */
export const IDR_ATTORNEY_ROLES: ReadonlyArray<UserRole> = ['idr-attorney'];

export function isInternalStaff(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return (INTERNAL_STAFF_ROLES as readonly string[]).includes(role);
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Checks authentication on an API route request.
 * Returns the authenticated user or a 401 response.
 *
 * Demo mode (no Supabase config) auto-admins ONLY in non-production
 * environments. In production, demo mode + a request to an authenticated
 * route is a 401 — never a free admin session. This closes the bypass
 * where a misconfigured prod (Supabase keys empty in the AWS secrets
 * vault) silently handed admin access to anyone on the internet.
 */
function hasDemoPreviewCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') || '';
  return cookie.includes('demo_access=granted');
}

export async function requireAuth(
  request: Request
): Promise<{ user: AuthUser } | NextResponse> {
  if (isDemoMode() || hasDemoPreviewCookie(request)) {
    if (isDemoMode() && process.env.NODE_ENV === 'production' && !hasDemoPreviewCookie(request)) {
      const ctx = getRequestContext(request);
      await logSecurityEvent(
        'auth_failure',
        'anonymous',
        { reason: 'demo_mode_in_production' },
        ctx,
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return {
      user: { id: 'demo-user', email: 'demo@vantaum.com', role: 'admin' },
    };
  }

  try {
    const sessionUser = await getAuthAdapter().getSessionUser(request);
    if (!sessionUser) {
      const ctx = getRequestContext(request);
      await logSecurityEvent('auth_failure', 'anonymous', { reason: 'no_session' }, ctx);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role precedence:
    //   1. Adapter-provided role (Cognito custom:role attribute) — authoritative
    //      once we cut over to Cognito.
    //   2. user_profiles.role lookup — current Supabase path; the role lives
    //      in a separate table, not in the auth user metadata.
    //   3. 'reviewer' default — last-resort, matches prior behavior.
    let role: UserRole | undefined = sessionUser.role as UserRole | undefined;
    if (!role) {
      try {
        const svc = getServiceClient();
        const { data: profile } = await svc
          .from('user_profiles')
          .select('role')
          .eq('id', sessionUser.id)
          .single();
        role = (profile?.role as UserRole) || undefined;
      } catch {
        // Falls through to default; absence of profile row is not fatal.
      }
    }

    return {
      user: { id: sessionUser.id, email: sessionUser.email, role: role ?? 'reviewer' },
    };
  } catch {
    return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
  }
}

/**
 * Checks that the authenticated user has one of the required roles.
 * Returns the user or a 403 response.
 */
export async function requireRole(
  request: Request,
  roles: UserRole[]
): Promise<{ user: AuthUser } | NextResponse> {
  const result = await requireAuth(request);

  // If requireAuth returned a Response (error), pass it through
  if (result instanceof NextResponse) return result;

  if (!roles.includes(result.user.role)) {
    const ctx = getRequestContext(request);
    await logSecurityEvent(
      'permission_denied',
      result.user.email,
      { required_roles: roles, actual_role: result.user.role },
      ctx
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return result;
}

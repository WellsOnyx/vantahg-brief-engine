import { NextResponse } from 'next/server';
import { createServerClient } from './supabase-server';
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
  | 'concierge';

/**
 * Roles considered "internal staff" — admin + organizational + exec views.
 * Distinct from 'client' (tenant users). Used for nav gating, case-access
 * decisions, and the new staff-management roster.
 */
export const INTERNAL_STAFF_ROLES: ReadonlyArray<UserRole> = [
  'admin', 'reviewer', 'builder', 'ceo', 'practice-lead', 'slt', 'delivery-lead', 'concierge',
];

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
export async function requireAuth(
  request: Request
): Promise<{ user: AuthUser } | NextResponse> {
  if (isDemoMode()) {
    if (process.env.NODE_ENV === 'production') {
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
    const supabase = await createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      const ctx = getRequestContext(request);
      await logSecurityEvent('auth_failure', 'anonymous', { reason: 'no_session' }, ctx);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch role from user_profiles table
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role: UserRole = (profile?.role as UserRole) || 'reviewer';

    return {
      user: { id: user.id, email: user.email || '', role },
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

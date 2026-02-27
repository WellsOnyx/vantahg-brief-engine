import { NextResponse } from 'next/server';
import { createServerClient } from './supabase-server';
import { logSecurityEvent } from './audit';
import { getRequestContext } from './security';
import { isDemoMode } from './demo-mode';

export type UserRole = 'admin' | 'reviewer' | 'client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Checks authentication on an API route request.
 * Returns the authenticated user or a 401 response.
 *
 * In demo mode, returns a mock admin user so the app remains functional.
 */
export async function requireAuth(
  request: Request
): Promise<{ user: AuthUser } | NextResponse> {
  // Demo mode bypass — return mock admin
  if (isDemoMode()) {
    return {
      user: { id: 'demo-user', email: 'demo@vantahg.com', role: 'admin' },
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

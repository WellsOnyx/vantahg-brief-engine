import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole, type UserRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'admin', 'reviewer', 'client', 'builder', 'ceo', 'practice-lead', 'slt',
]);

/**
 * PATCH /api/team/[id]/role
 *
 * Admin-only role change on a user_profiles row. Writes a security audit
 * event with before/after so every role change is traceable.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const newRole = body?.role as UserRole | undefined;

    if (!newRole || !VALID_ROLES.has(newRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true, role: newRole });
    }

    const supabase = getServiceClient();

    // Read current role for the audit diff.
    const { data: before, error: readErr } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (readErr || !before) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', id);

    if (updateErr) {
      return apiError(updateErr, {
        operation: 'team_role_update',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Security-relevant — role changes affect what data the user can see.
    await logAuditEvent(null, 'security:team_role_changed', authResult.user.email, {
      target_user_id: id,
      before: before.role,
      after: newRole,
    }, getRequestContext(request));

    return NextResponse.json({ success: true, role: newRole });
  } catch (err) {
    return apiError(err, {
      operation: 'team_role_update',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

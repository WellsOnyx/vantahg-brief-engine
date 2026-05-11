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
 * POST /api/team/invite
 *
 * Admin-only. Sends a Supabase Auth invitation email via the service-
 * role admin API (`auth.admin.inviteUserByEmail`). On success Supabase
 * creates a row in auth.users which fires the handle_new_user trigger
 * (migration 001), which inserts a user_profiles row with the default
 * role. We then PATCH that profile to the requested role.
 *
 * Phase 1 behavior:
 *   - If auth.admin.inviteUserByEmail succeeds → role is applied + audit
 *   - If it fails (e.g. SMTP not configured) → returns a clear "Phase 2"
 *     message rather than 500ing. The admin can manually set the role
 *     after the user signs up through /team.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const role = body?.role as UserRole | undefined;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!role || !VALID_ROLES.has(role)) {
      return NextResponse.json({ error: 'Valid role required' }, { status: 400 });
    }

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: `Invitation queued for ${email} as ${role} (demo mode — no email sent).`,
      });
    }

    const supabase = getServiceClient();

    // Try Supabase Auth admin invite. Requires SUPABASE_SERVICE_ROLE_KEY
    // + outbound SMTP configured at the project level.
    try {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name },
      });
      if (error || !data?.user?.id) {
        // Most common Phase 1 failure: SMTP not configured. Surface a clean
        // message rather than a 500.
        await logAuditEvent(null, 'security:team_invite_failed', authResult.user.email, {
          target_email_domain: email.split('@')[1] ?? null,
          target_role: role,
          reason: 'auth_admin_invite_returned_error',
        }, getRequestContext(request));
        return NextResponse.json({
          success: false,
          message:
            'Invitation could not be sent automatically — configure Supabase Auth SMTP, or have the user sign up at /signup and set their role from this page.',
        }, { status: 200 });
      }

      // handle_new_user trigger has already inserted a user_profiles row
      // with the default role. Update it to the requested role.
      const newUserId = data.user.id;
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({ name, role })
        .eq('id', newUserId);

      if (profileErr) {
        // The invite succeeded but role didn't stick — log it loudly and
        // tell the admin so they can fix it manually.
        await logAuditEvent(null, 'security:team_invite_role_not_applied', authResult.user.email, {
          target_user_id: newUserId,
          target_role: role,
          error_code: profileErr.code ?? null,
        }, getRequestContext(request));
        return NextResponse.json({
          success: true,
          partial: true,
          message: `Invitation sent to ${email} but role couldn't be applied — set it manually from the roster below once they sign up.`,
        });
      }

      await logAuditEvent(null, 'security:team_invited', authResult.user.email, {
        target_user_id: newUserId,
        target_role: role,
        target_email_domain: email.split('@')[1] ?? null,
      }, getRequestContext(request));

      return NextResponse.json({
        success: true,
        message: `Invitation sent to ${email} as ${role}.`,
      });
    } catch (inviteErr) {
      // SDK threw — almost certainly admin API unavailable.
      await logAuditEvent(null, 'security:team_invite_failed', authResult.user.email, {
        target_role: role,
        reason: 'auth_admin_invite_threw',
        error_kind: inviteErr instanceof Error ? inviteErr.name : typeof inviteErr,
      }, getRequestContext(request));
      return NextResponse.json({
        success: false,
        message:
          'Invitation send is not wired (Phase 2). Have the user sign up at /signup and set their role from this page.',
      }, { status: 200 });
    }
  } catch (err) {
    return apiError(err, {
      operation: 'team_invite',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

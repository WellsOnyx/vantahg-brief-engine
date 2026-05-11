import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent, logSecurityEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dev/promote-me
 *
 * One-time self-promotion endpoint restricted to a SINGLE hardcoded email.
 * Exists so the founder can bootstrap their own admin role from an iPad
 * (no terminal access → can't run scripts/bootstrap-master-admin.ts).
 *
 * Safety invariants:
 *   1. The check is server-side against the authenticated session — a
 *      caller cannot lie about their email; it comes from the Supabase
 *      JWT, not request input.
 *   2. The allowlist is a single email, compared lowercase. Any other
 *      authenticated user hitting this endpoint gets 403 + a
 *      security:promote_me_denied audit event so misuse is visible.
 *   3. Idempotent — re-calling for the founder is a no-op if already
 *      admin. Safe to leave wired in.
 *   4. Demo mode short-circuits to a 404 (no real promotions in fixtures).
 *   5. The endpoint redirects to /mission-control on success so the
 *      founder lands directly on the admin home after promotion.
 *
 * Once the founder has a computer, this endpoint should be removed and
 * future bootstraps go through scripts/bootstrap-master-admin.ts.
 */

const FOUNDER_EMAIL = 'me@jonahmanning.co';

export async function GET(request: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ error: 'Not available in demo mode' }, { status: 404 });
    }

    // Resolve the authenticated user from the session cookie. The session
    // client respects Supabase Auth — we trust auth.email from the JWT,
    // never request input.
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in first at /login, then revisit this URL.' },
        { status: 401 },
      );
    }

    const sessionEmail = (user.email ?? '').toLowerCase().trim();

    if (sessionEmail !== FOUNDER_EMAIL) {
      // Any other authenticated user trying this endpoint is a security-
      // relevant event. Log who attempted it.
      await logSecurityEvent(
        'promote_me_denied',
        sessionEmail || 'unknown',
        { reason: 'email_not_on_allowlist' },
        getRequestContext(request),
      );
      return NextResponse.json(
        { error: 'This endpoint is restricted to a specific email.' },
        { status: 403 },
      );
    }

    // Use the service role client to update user_profiles. RLS on
    // user_profiles only allows admins to update other profiles, and the
    // founder is currently NOT admin — that's the entire problem we're
    // solving. Service role bypasses RLS.
    const supabase = getServiceClient();

    const { data: before } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (before?.role === 'admin') {
      // Already admin — no-op. Redirect anyway so the iPad flow works
      // identically whether it's the first or fifth visit.
      return NextResponse.redirect(new URL('/mission-control', request.url));
    }

    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ role: 'admin' })
      .eq('id', user.id);

    if (updateErr) {
      return apiError(updateErr, {
        operation: 'promote_me',
        actor: sessionEmail,
        requestContext: getRequestContext(request),
      });
    }

    // Audit the promotion. logAuditEvent writes to audit_log with the
    // security:founder_self_promoted action — auditable forever.
    await logAuditEvent(
      null,
      'security:founder_self_promoted',
      sessionEmail,
      { user_id: user.id, before_role: before?.role ?? null, after_role: 'admin' },
      getRequestContext(request),
    );

    // Land them directly on admin home. They'll need to sign out and
    // back in for the role to refresh in their session — call that out
    // in the success page rather than silently leaving them in a
    // half-promoted state.
    const url = new URL('/mission-control', request.url);
    url.searchParams.set('promoted', '1');
    return NextResponse.redirect(url);
  } catch (err) {
    return apiError(err, {
      operation: 'promote_me',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

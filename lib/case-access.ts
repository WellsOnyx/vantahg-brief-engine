import { NextResponse } from 'next/server';
import { logSecurityEvent } from './audit';
import { getRequestContext, type RequestContext } from './security';
import { isInternalStaff, type AuthUser } from './auth-guard';

/**
 * Case-level authorization check.
 *
 * Admin and reviewer roles can access any case (mirrors the RLS policy
 * "Admin and reviewer full access to cases" from migration 001).
 *
 * Client role can only access cases their client record owns. Linkage is
 * via `clients.contact_email` matching the user's authenticated JWT email
 * — same mechanism the RLS policy "Clients can read their own cases" uses.
 * This is the email-only linkage we keep for the first 1–3 TPAs; when we
 * add `user_profiles.client_id`, this function is the single place to
 * update.
 *
 * Returns `null` when the user is authorized. Returns a 403 NextResponse
 * (after writing a security audit event) when not. Routes should:
 *
 *   const denied = await assertCaseAccess(caseData, user, request);
 *   if (denied) return denied;
 *
 * `caseData` is expected to be the row already loaded by the route, with
 * the joined `client` record. We accept a loose shape here because Supabase
 * typed selects are project-specific; the contract is just `id`,
 * `client_id`, and an optional `client.contact_email`.
 */

interface CaseLike {
  id: string;
  client_id?: string | null;
  client?: { contact_email?: string | null } | null;
}

export async function assertCaseAccess(
  caseData: CaseLike,
  user: AuthUser,
  request: Request,
): Promise<NextResponse | null> {
  // Internal staff roles (admin, reviewer, and the organizational
  // builder/ceo/practice-lead/slt views) are unrestricted at the case
  // level. They are VantaUM-side users, not tenant clients.
  if (isInternalStaff(user.role)) return null;

  // Client role: contact_email must match. If the case has no client_id
  // at all, no client user owns it — deny.
  if (user.role === 'client') {
    const ownerEmail = caseData.client?.contact_email?.toLowerCase().trim();
    const userEmail = user.email?.toLowerCase().trim();
    if (ownerEmail && userEmail && ownerEmail === userEmail) return null;

    const ctx: RequestContext = getRequestContext(request);
    await logSecurityEvent(
      'case_access_denied',
      user.email,
      {
        case_id: caseData.id,
        // We deliberately do NOT log the owner email here — that's another
        // tenant's PHI. Just enough to identify the probe pattern.
        had_client_record: !!caseData.client_id,
      },
      ctx,
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Unknown role — fail closed.
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

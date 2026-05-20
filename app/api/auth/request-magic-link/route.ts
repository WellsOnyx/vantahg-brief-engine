import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/request-magic-link
 *
 * Triggers the auth adapter to send a magic-link email to the supplied
 * email address.
 *
 * Cognito path: AdminCreateUser (MessageAction=SUPPRESS) if user doesn't
 * exist, then AdminInitiateAuth(CUSTOM_AUTH) which triggers the
 * create-auth-challenge Lambda to email
 * `${APP_URL}/api/auth/callback?code=<otp>&user=<sub>`.
 *
 * Supabase path: auth.admin.generateLink({type: 'magiclink'}) which sends
 * via the project's SMTP.
 *
 * Both paths return the same response shape so the UI is provider-agnostic.
 * We deliberately do NOT reveal whether the email was newly created vs
 * already existed — that's a userbase enumeration hazard.
 */

const Body = z.object({
  email: z.string().email().max(320),
  /** Optional landing page after successful auth — passed through to the link's `?next=` param.
   *  Same-origin paths only; the callback re-validates. */
  next: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 10 });
  if (rateLimited) return rateLimited;

  const ctx = getRequestContext(request);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const appUrl = process.env.APP_URL || `https://${request.headers.get('host')}`;
  const next = body.next && body.next.startsWith('/') ? body.next : '/dashboard';
  const redirectUrl = `${appUrl}/api/auth/callback?next=${encodeURIComponent(next)}`;

  const adapter = getAuthAdapter();
  const result = await adapter.createUserWithMagicLink({
    email,
    redirectUrl,
  });

  if (!result.ok) {
    await logSecurityEvent(
      'magic_link_request_failed',
      email,
      { code: result.code, message: result.message },
      ctx,
    );
    // Map adapter errors to status codes but keep response opaque to caller
    // for non-rate-limit cases (no userbase enumeration).
    const status = result.code === 'rate_limited' ? 429 : 202;
    return NextResponse.json({ status: 'sent' }, { status });
  }

  await logSecurityEvent('magic_link_requested', email, { preExisting: result.preExisting }, ctx);
  return NextResponse.json({ status: 'sent' }, { status: 202 });
}
